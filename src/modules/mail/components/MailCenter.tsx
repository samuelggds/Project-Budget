import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Budget } from "../../budgets/types/Budget";
import type { Client } from "../../clients/types/Client";
import { getPdf } from "../../pdf/services/pdfStorage";
import {
  blobToAttachment,
  downloadAttachment,
  fileToAttachment,
  sendMail,
  type OutgoingAttachment,
} from "../services/mailApi";
import {
  deleteDraft,
  listMessages,
  listThread,
  markMessageRead,
  moveMessage,
  saveDraft,
} from "../services/mailDatabase";
import type { MailDraft, MailFolder, MailMessage } from "../types/Mail";

type Props = {
  budgets: Budget[];
  clients: Client[];
  notify: (message: string) => void;
  onCreateBudgetFromSender: (name: string, email: string) => void;
};

const folders: Array<{ value: MailFolder; label: string; icon: string }> = [
  { value: "inbox", label: "Caixa de entrada", icon: "✉" },
  { value: "sent", label: "Enviados", icon: "↗" },
  { value: "draft", label: "Rascunhos", icon: "▱" },
  { value: "archive", label: "Arquivados", icon: "▣" },
  { value: "trash", label: "Lixeira", icon: "⌫" },
];

const emptyDraft = (): MailDraft => ({
  to: "",
  cc: "",
  bcc: "",
  subject: "",
  text: "",
});

function when(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function statusLabel(status: MailMessage["status"]) {
  const labels: Record<MailMessage["status"], string> = {
    received: "Recebido",
    draft: "Rascunho",
    sending: "Enviando",
    sent: "Enviado",
    delivered: "Entregue",
    bounced: "Devolvido",
    complained: "Reclamação",
    failed: "Falhou",
  };
  return labels[status];
}

function uniqueAddresses(values: string[]) {
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))];
}

export function MailCenter({
  budgets,
  clients,
  notify,
  onCreateBudgetFromSender,
}: Props) {
  const [folder, setFolder] = useState<MailFolder>("inbox");
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [selected, setSelected] = useState<MailMessage | null>(null);
  const [thread, setThread] = useState<MailMessage[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [draft, setDraft] = useState<MailDraft>(emptyDraft);
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [selectedBudgetId, setSelectedBudgetId] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listMessages(folder, search);
      setMessages(data);
      if (selected && !data.some((item) => item.id === selected.id)) {
        setSelected(null);
        setThread([]);
      }
    } catch (error) {
      notify("Erro ao carregar e-mails: " + (error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [folder, search, selected, notify]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 220);
    return () => window.clearTimeout(timer);
  }, [folder, search]);

  useEffect(() => {
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const unreadCount = useMemo(
    () => messages.filter((message) => message.folder === "inbox" && !message.readAt).length,
    [messages],
  );

  const openMessage = async (message: MailMessage) => {
    if (message.folder === "draft") {
      setDraft({
        id: message.id,
        to: message.toAddresses.join(", "),
        cc: message.ccAddresses.join(", "),
        bcc: message.bccAddresses.join(", "),
        subject: message.subject,
        text: message.textBody,
        threadId: message.threadId,
        inReplyTo: message.inReplyTo || undefined,
        references: message.references,
        budgetId: message.budgetId,
        clientId: message.clientId,
      });
      setSelectedBudgetId(message.budgetId || "");
      setFiles([]);
      setComposeOpen(true);
      return;
    }

    setSelected(message);
    try {
      const data = await listThread(message.threadId);
      setThread(data);
      if (!message.readAt && message.folder === "inbox") {
        await markMessageRead(message.id);
        setMessages((current) =>
          current.map((item) =>
            item.id === message.id ? { ...item, readAt: new Date().toISOString() } : item,
          ),
        );
        setSelected({ ...message, readAt: new Date().toISOString() });
      }
    } catch (error) {
      notify("Erro ao abrir conversa: " + (error as Error).message);
    }
  };

  const startCompose = () => {
    setDraft(emptyDraft());
    setSelectedBudgetId("");
    setFiles([]);
    setComposeOpen(true);
  };

  const startReply = (message: MailMessage, replyAll = false) => {
    const to = message.replyToAddresses[0] || message.fromAddress;
    const extra = replyAll
      ? uniqueAddresses([
          ...message.toAddresses,
          ...message.ccAddresses,
        ]).filter(
          (address) =>
            address !== "contato@mgrefrigeracoes.com.br" &&
            address !== to.toLowerCase(),
        )
      : [];

    setDraft({
      to,
      cc: extra.join(", "),
      bcc: "",
      subject: /^re:/i.test(message.subject) ? message.subject : "Re: " + message.subject,
      text: "",
      threadId: message.threadId,
      inReplyTo: message.messageId,
      references: [...new Set([...message.references, message.messageId].filter(Boolean))],
      budgetId: message.budgetId,
      clientId: message.clientId,
    });
    setSelectedBudgetId(message.budgetId || "");
    setFiles([]);
    setComposeOpen(true);
  };

  const startForward = (message: MailMessage) => {
    setDraft({
      to: "",
      cc: "",
      bcc: "",
      subject: /^fwd:/i.test(message.subject) ? message.subject : "Fwd: " + message.subject,
      text:
        "\n\n---------- Mensagem encaminhada ----------\nDe: " +
        (message.fromName || message.fromAddress) +
        " <" +
        message.fromAddress +
        ">\nData: " +
        when(message.receivedAt || message.sentAt || message.createdAt) +
        "\nAssunto: " +
        message.subject +
        "\n\n" +
        message.textBody,
      threadId: crypto.randomUUID(),
    });
    setSelectedBudgetId("");
    setFiles([]);
    setComposeOpen(true);
  };

  const chooseBudget = (budgetId: string) => {
    setSelectedBudgetId(budgetId);
    const budget = budgets.find((item) => item.id === budgetId);
    if (!budget) {
      setDraft((current) => ({ ...current, budgetId: undefined, clientId: undefined }));
      return;
    }

    setDraft((current) => ({
      ...current,
      to: current.to || budget.client.email,
      subject:
        current.subject ||
        "MG Refrigerações - Orçamento " + budget.number,
      text:
        current.text ||
        "Olá " +
          (budget.client.name || "cliente") +
          ",\n\nConforme solicitado, segue em anexo o orçamento " +
          budget.number +
          " para sua análise.\n\nEm caso de dúvidas ou para aprovar o orçamento, responda a este e-mail.\n\nAtenciosamente,\nMG Refrigerações",
      budgetId: budget.id,
      clientId: budget.client.id || undefined,
    }));
  };

  const selectClient = (clientId: string) => {
    const client = clients.find((item) => item.id === clientId);
    if (!client?.email) return;
    setDraft((current) => ({
      ...current,
      to: current.to || client.email,
      clientId: client.id,
    }));
  };

  const buildAttachments = async () => {
    const outgoing: OutgoingAttachment[] = [];
    for (const file of files) outgoing.push(await fileToAttachment(file));

    if (selectedBudgetId) {
      const budget = budgets.find((item) => item.id === selectedBudgetId);
      if (budget) {
        const pdf = await getPdf(budget.id);
        if (!pdf) {
          throw new Error(
            "O PDF do orçamento ainda não foi gerado neste dispositivo. Abra o orçamento e use Salvar e baixar PDF antes de enviá-lo.",
          );
        }
        outgoing.push(await blobToAttachment(pdf, budget.number + ".pdf"));
      }
    }

    return outgoing;
  };

  const submit = async () => {
    if (!draft.to.trim()) return notify("Informe o destinatário do e-mail.");
    if (!draft.subject.trim()) return notify("Informe o assunto do e-mail.");
    if (!draft.text.trim()) return notify("Escreva a mensagem.");

    setSending(true);
    try {
      const attachments = await buildAttachments();
      await sendMail(draft, attachments);
      if (draft.id) await deleteDraft(draft.id);
      setComposeOpen(false);
      setDraft(emptyDraft());
      setFiles([]);
      setSelectedBudgetId("");
      notify("E-mail enviado com sucesso.");
      if (folder === "sent") await load();
    } catch (error) {
      notify("Erro ao enviar: " + (error as Error).message);
    } finally {
      setSending(false);
    }
  };

  const persistDraft = async () => {
    setSavingDraft(true);
    try {
      const saved = await saveDraft({
        ...draft,
        budgetId: selectedBudgetId || draft.budgetId,
      });
      setDraft((current) => ({ ...current, id: saved.id }));
      notify("Rascunho salvo.");
      if (folder === "draft") await load();
    } catch (error) {
      notify("Erro ao salvar rascunho: " + (error as Error).message);
    } finally {
      setSavingDraft(false);
    }
  };

  const move = async (message: MailMessage, target: MailFolder) => {
    try {
      await moveMessage(message.id, target);
      setSelected(null);
      setThread([]);
      await load();
      notify(target === "archive" ? "E-mail arquivado." : "E-mail movido para a lixeira.");
    } catch (error) {
      notify("Erro: " + (error as Error).message);
    }
  };

  return (
    <section className="mail-center">
      <aside className="mail-folders">
        <button className="button primary mail-compose-button" onClick={startCompose}>
          ＋ Novo e-mail
        </button>
        {folders.map((item) => (
          <button
            key={item.value}
            className={folder === item.value ? "active" : ""}
            onClick={() => {
              setFolder(item.value);
              setSelected(null);
              setThread([]);
            }}
          >
            <span>{item.icon}</span>
            {item.label}
            {item.value === "inbox" && unreadCount > 0 && <b>{unreadCount}</b>}
          </button>
        ))}
      </aside>

      <div className="mail-list-panel">
        <div className="mail-toolbar">
          <div className="search">
            <span>⌕</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por remetente ou assunto"
            />
          </div>
          <button className="button" onClick={() => void load()} disabled={loading}>
            {loading ? "Atualizando..." : "↻ Atualizar"}
          </button>
        </div>

        <div className="mail-list">
          {!loading && messages.length === 0 && (
            <div className="mail-empty">Nenhum e-mail nesta pasta.</div>
          )}
          {messages.map((message) => (
            <button
              key={message.id}
              className={
                "mail-list-item " +
                (!message.readAt && message.folder === "inbox" ? "unread " : "") +
                (selected?.id === message.id ? "selected" : "")
              }
              onClick={() => void openMessage(message)}
            >
              <div>
                <strong>
                  {message.direction === "outbound"
                    ? message.toAddresses.join(", ") || "Sem destinatário"
                    : message.fromName || message.fromAddress}
                </strong>
                <time>{when(message.receivedAt || message.sentAt || message.createdAt)}</time>
              </div>
              <b>{message.subject}</b>
              <p>{message.snippet || message.textBody.slice(0, 180) || "Sem conteúdo"}</p>
              <small className={"mail-status " + message.status}>
                {statusLabel(message.status)}
              </small>
            </button>
          ))}
        </div>
      </div>

      <div className="mail-reader">
        {!selected ? (
          <div className="mail-empty reader-empty">
            <span>✉</span>
            <strong>Selecione uma mensagem</strong>
            <p>Abra um e-mail para visualizar a conversa, responder ou encaminhar.</p>
          </div>
        ) : (
          <>
            <header className="mail-reader-head">
              <div>
                <p className="eyebrow">CONVERSA</p>
                <h2>{selected.subject}</h2>
                <span>
                  {selected.fromName || selected.fromAddress} · {when(selected.receivedAt || selected.sentAt)}
                </span>
              </div>
              <div className="mail-reader-actions">
                {selected.direction === "inbound" && (
                  <button
                    className="button primary"
                    onClick={() =>
                      onCreateBudgetFromSender(
                        selected.fromName || "",
                        selected.fromAddress,
                      )
                    }
                  >
                    Criar orçamento
                  </button>
                )}
                <button className="button soft" onClick={() => startReply(selected)}>
                  Responder
                </button>
                <button className="button" onClick={() => startReply(selected, true)}>
                  Responder a todos
                </button>
                <button className="button" onClick={() => startForward(selected)}>
                  Encaminhar
                </button>
                {selected.folder !== "archive" && selected.folder !== "trash" && (
                  <button className="button" onClick={() => void move(selected, "archive")}>
                    Arquivar
                  </button>
                )}
                {selected.folder !== "trash" && (
                  <button className="button danger" onClick={() => void move(selected, "trash")}>
                    Lixeira
                  </button>
                )}
              </div>
            </header>

            <div className="mail-thread">
              {(thread.length ? thread : [selected]).map((message) => (
                <article className="mail-message-card" key={message.id}>
                  <header>
                    <div>
                      <strong>{message.fromName || message.fromAddress}</strong>
                      <span>
                        &lt;{message.fromAddress}&gt; → {message.toAddresses.join(", ")}
                      </span>
                    </div>
                    <time>{when(message.receivedAt || message.sentAt || message.createdAt)}</time>
                  </header>
                  <pre>{message.textBody || message.snippet || "Sem conteúdo em texto."}</pre>
                  {message.attachments.length > 0 && (
                    <div className="mail-attachments">
                      {message.attachments.map((attachment) => (
                        <button
                          className="button"
                          key={attachment.id}
                          onClick={() =>
                            void downloadAttachment(attachment.id, attachment.filename).catch(
                              (error) => notify((error as Error).message),
                            )
                          }
                        >
                          ⎘ {attachment.filename}
                          <small>{Math.max(1, Math.round(attachment.sizeBytes / 1024))} KB</small>
                        </button>
                      ))}
                    </div>
                  )}
                  <small className={"mail-status " + message.status}>
                    {statusLabel(message.status)}
                  </small>
                </article>
              ))}
            </div>
          </>
        )}
      </div>

      {composeOpen && (
        <div className="mail-compose-backdrop" role="dialog" aria-modal="true">
          <section className="mail-compose">
            <header>
              <div>
                <p className="eyebrow">CONTATO@MGREFRIGERACOES.COM.BR</p>
                <h2>{draft.id ? "Editar rascunho" : "Novo e-mail"}</h2>
              </div>
              <button
                className="mail-compose-close"
                aria-label="Fechar"
                onClick={() => setComposeOpen(false)}
              >
                ×
              </button>
            </header>

            <div className="mail-compose-grid">
              <label>
                Cliente cadastrado
                <select defaultValue="" onChange={(event) => selectClient(event.target.value)}>
                  <option value="">Selecionar cliente</option>
                  {clients
                    .filter((client) => client.email)
                    .map((client) => (
                      <option value={client.id} key={client.id}>
                        {client.name} · {client.email}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Orçamento para anexar
                <select
                  value={selectedBudgetId}
                  onChange={(event) => chooseBudget(event.target.value)}
                >
                  <option value="">Sem orçamento</option>
                  {budgets.map((budget) => (
                    <option value={budget.id} key={budget.id}>
                      {budget.number} · {budget.client.name || "Cliente"}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label>
              Para
              <input
                type="email"
                value={draft.to}
                onChange={(event) => setDraft({ ...draft, to: event.target.value })}
                placeholder="cliente@email.com"
              />
            </label>
            <div className="mail-compose-grid">
              <label>
                Cc
                <input
                  value={draft.cc}
                  onChange={(event) => setDraft({ ...draft, cc: event.target.value })}
                  placeholder="Opcional"
                />
              </label>
              <label>
                Cco
                <input
                  value={draft.bcc}
                  onChange={(event) => setDraft({ ...draft, bcc: event.target.value })}
                  placeholder="Opcional"
                />
              </label>
            </div>
            <label>
              Assunto
              <input
                value={draft.subject}
                onChange={(event) => setDraft({ ...draft, subject: event.target.value })}
                placeholder="Assunto do e-mail"
              />
            </label>
            <label>
              Mensagem
              <textarea
                rows={12}
                value={draft.text}
                onChange={(event) => setDraft({ ...draft, text: event.target.value })}
                placeholder="Escreva sua mensagem..."
              />
            </label>

            <div className="mail-compose-attachments">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                onChange={(event) => setFiles(Array.from(event.target.files || []))}
              />
              <button className="button" onClick={() => fileInputRef.current?.click()}>
                ＋ Anexar arquivo
              </button>
              {selectedBudgetId && <span>PDF do orçamento será anexado ao enviar.</span>}
              {files.map((file) => (
                <span key={file.name + file.size}>{file.name}</span>
              ))}
            </div>

            <footer>
              <button className="button" onClick={() => void persistDraft()} disabled={savingDraft}>
                {savingDraft ? "Salvando..." : "Salvar rascunho"}
              </button>
              <div>
                <button className="button" onClick={() => setComposeOpen(false)}>
                  Cancelar
                </button>
                <button className="button primary" onClick={() => void submit()} disabled={sending}>
                  {sending ? "Enviando..." : "Enviar e-mail"}
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}
