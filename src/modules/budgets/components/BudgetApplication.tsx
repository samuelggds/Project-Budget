import { useEffect, useMemo, useState } from "react";
import type { Budget, BudgetItem as Item } from "../types/Budget";
import { deletePdf, getPdf, savePdf } from "../../pdf/services/pdfStorage";
import {
  createInitialBudget,
  createNextBudget,
} from "../services/budgetFactory";
import {
  calculateBudgetTotal,
  formatMoney as money,
} from "../services/budgetCalculations";
import {
  filterBudgets,
  HISTORY_PAGE_SIZE,
  paginateBudgets,
} from "../../history/services/filterBudgets";
import { createBudgetPdf, downloadPdfBlob } from "../../pdf/services/budgetPdf";
import type { Client } from "../../clients/types/Client";
import type { Service } from "../../services/types/Service";
import { getAllowedNextStatuses } from "../services/budgetStatus";
import { calculateAllSplits, calculateBudgetSplit, hasSplit, SPLIT_RATE } from "../services/budgetSplit";
import { supabase } from "../../auth/services/supabase";
import { deleteBudgetFromDatabase, loadDatabase, saveBudgetToDatabase, saveClientToDatabase, saveServiceToDatabase } from "../../shared/services/supabaseDatabase";

export function BudgetApplication() {
  const [tab, setTab] = useState<"new" | "saved" | "clients" | "services" | "splits" | "settings">("new");
  const [preview, setPreview] = useState(false);
  const [budget, setBudget] = useState<Budget>(createInitialBudget);
  const [saved, setSaved] = useState<Budget[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [periodFilter, setPeriodFilter] = useState("Todos");
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [databaseLoading, setDatabaseLoading] = useState(true);
  const [databaseError, setDatabaseError] = useState("");
  const [clientDraft, setClientDraft] = useState<Client>({ id: "", name: "", document: "", phone: "", email: "", contact: "", address: "", city: "", state: "CE", cep: "" });
  const [serviceDraft, setServiceDraft] = useState<Service>({ id: "", code: "", description: "", unit: "serv.", unitPrice: 0 });

  const total = useMemo(() => calculateBudgetTotal(budget), [budget]);
  const filtered = filterBudgets(saved, {
    search,
    status: statusFilter,
    period: periodFilter,
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / HISTORY_PAGE_SIZE));
  const visibleBudgets = paginateBudgets(filtered, page);
  const splitBudgets = saved.filter(hasSplit);
  const splitTotal = calculateAllSplits(saved);

  useEffect(() => {
    loadDatabase()
      .then((data) => {
        setClients(data.clients); setServices(data.services); setSaved(data.budgets);
        if (data.budgets.length) setBudget(createNextBudget(data.budgets));
      })
      .catch((error: Error) => setDatabaseError(error.message))
      .finally(() => setDatabaseLoading(false));
  }, []);

  const notify = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(""), 2600);
  };

  const updateClient = (field: keyof Budget["client"], value: string) =>
    setBudget((old) => ({ ...old, client: { ...old.client, [field]: value } }));

  const updateItem = (id: string, field: keyof Item, value: string | number) =>
    setBudget((old) => ({
      ...old,
      items: old.items.map((item) =>
        item.id === id ? { ...item, [field]: value } : item,
      ),
    }));

  const addItem = () =>
    setBudget((old) => ({
      ...old,
      items: [
        ...old.items,
        {
          id: crypto.randomUUID(),
          serviceId: "",
          serviceCode: "",
          description: "",
          quantity: 1,
          unit: "un.",
          unitPrice: 0,
        },
      ],
    }));

  const selectClient = (clientId: string) => {
    const client = clients.find((item) => item.id === clientId);
    if (client) setBudget((old) => ({ ...old, client: { ...client } }));
  };

  const fillServiceByCode = (itemId: string, code: string) => {
    const service = services.find((item) => item.code.toLowerCase() === code.trim().toLowerCase() || item.id === code.trim());
    setBudget((old) => ({
      ...old,
      items: old.items.map((item) => item.id !== itemId ? item : service ? {
        ...item,
        serviceId: service.id,
        serviceCode: service.code,
        description: service.description,
        unit: service.unit,
        unitPrice: service.unitPrice,
      } : { ...item, serviceCode: code }),
    }));
  };

  const registerClient = async () => {
    if (!clientDraft.name.trim()) return notify("Informe o nome do cliente");
    try {
      const current = await saveClientToDatabase({ ...clientDraft, id: clientDraft.id || crypto.randomUUID() });
      setClients([current, ...clients.filter((item) => item.id !== current.id)]);
      setClientDraft({ id: "", name: "", document: "", phone: "", email: "", contact: "", address: "", city: "", state: "CE", cep: "" });
      notify("Cliente salvo no banco");
    } catch (error) { notify(`Erro: ${(error as Error).message}`); }
  };

  const registerService = async () => {
    if (!serviceDraft.code.trim() || !serviceDraft.description.trim()) return notify("Informe o código e o serviço");
    if (services.some((item) => item.code.toLowerCase() === serviceDraft.code.toLowerCase() && item.id !== serviceDraft.id)) return notify("Este código já está cadastrado");
    try {
      const current = await saveServiceToDatabase({ ...serviceDraft, id: serviceDraft.id || crypto.randomUUID() });
      setServices([current, ...services.filter((item) => item.id !== current.id)]);
      setServiceDraft({ id: "", code: "", description: "", unit: "serv.", unitPrice: 0 });
      notify("Serviço salvo no banco");
    } catch (error) { notify(`Erro: ${(error as Error).message}`); }
  };

  const advanceStatus = async (nextStatus: Budget["status"]) => {
    if (!getAllowedNextStatuses(budget.status).includes(nextStatus)) return notify("Mudança de status não permitida");
    try {
      const updated = await saveBudgetToDatabase({ ...budget, status: nextStatus });
      setBudget(updated); setSaved([updated, ...saved.filter((item) => item.id !== updated.id)]);
      notify(`Status alterado para ${nextStatus}`);
    } catch (error) { notify(`Erro: ${(error as Error).message}`); }
  };

  const downloadServicesPdf = async () => {
    const element = document.getElementById("service-pdf");
    if (!element) return;
    notify("Gerando planilha em PDF...");
    const pdf = await createBudgetPdf(element, `planilha-servicos-${new Date().toISOString().slice(0, 10)}.pdf`);
    await pdf.download();
    notify("Planilha baixada em PDF");
  };

  const saveBudget = async () => {
    try {
      const current = await saveBudgetToDatabase(budget);
      setBudget(current); setSaved([current, ...saved.filter((item) => item.id !== current.id)]);
      notify("Orçamento salvo no banco");
    } catch (error) { notify(`Erro: ${(error as Error).message}`); }
  };

  const newBudget = () => {
    setBudget(createNextBudget(saved));
    setPreview(false);
    setTab("new");
  };

  const openBudget = (item: Budget) => {
    setBudget(item);
    setTab("new");
    setPreview(false);
  };

  const removeBudget = async (item: Budget) => {
    if (
      !window.confirm(
        `Excluir o orçamento ${item.number} de ${item.client.name || "cliente não informado"}?`,
      )
    )
      return;
    try {
      await deleteBudgetFromDatabase(item.id);
      const next = saved.filter((savedItem) => savedItem.id !== item.id);
      setSaved(next); await deletePdf(item.id);
      if (visibleBudgets.length === 1 && page > 1) setPage(page - 1);
      notify("Orçamento e PDF excluídos");
    } catch (error) { notify(`Erro: ${(error as Error).message}`); }
  };

  const generateAndStorePdf = async () => {
    const element = document.getElementById("budget-pdf");
    if (!element) return;
    notify("Gerando PDF...");
    const pdf = await createBudgetPdf(element, `${budget.number}.pdf`);
    const blob = pdf.blob;
    await savePdf(budget.id, blob);
    const updated = {
      ...budget,
      pdfSavedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const next = [updated, ...saved.filter((item) => item.id !== updated.id)];
    setBudget(updated);
    setSaved(next);
    await saveBudgetToDatabase(updated);
    await pdf.download();
    notify("Orçamento e PDF salvos");
  };

  const downloadStoredPdf = async (item: Budget) => {
    const blob = await getPdf(item.id);
    if (!blob) {
      notify("PDF não encontrado. Abra o orçamento e gere novamente.");
      return;
    }
    downloadPdfBlob(blob, `${item.number}.pdf`);
  };

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("Todos");
    setPeriodFilter("Todos");
    setPage(1);
  };

  if (databaseLoading) return <div className="auth-loading"><img src="/MG.jpg" alt="MG" /><span>Carregando dados do banco...</span></div>;

  if (databaseError) return (
    <main className="database-error-page"><section className="login-card"><div className="login-brand"><img src="/MG.jpg" alt="MG" /><div><strong>Erro ao acessar o banco</strong><span>Confira a configuração do Supabase</span></div></div><div className="login-error">{databaseError}</div><p>Confirme se as tabelas foram criadas, se o RLS possui as políticas indicadas e se as variáveis do arquivo .env estão corretas.</p><button className="button primary" onClick={() => window.location.reload()}>Tentar novamente</button></section></main>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/MG.jpg" alt="MG Refrigeração" />
          <div>
            <strong>MG Orçamentos</strong>
            <span>Refrigeração</span>
          </div>
        </div>
        <nav>
          <button
            className={tab === "new" ? "active" : ""}
            onClick={() => setTab("new")}
          >
            <i>＋</i>Novo orçamento
          </button>
          <button
            className={tab === "saved" ? "active" : ""}
            onClick={() => setTab("saved")}
          >
            <i>▤</i>Orçamentos
          </button>
          <button className={tab === "clients" ? "active" : ""} onClick={() => setTab("clients")}>
            <i>♙</i>Clientes
          </button>
          <button className={tab === "services" ? "active" : ""} onClick={() => setTab("services")}>
            <i>▦</i>Serviços
          </button>
          <button className={tab === "splits" ? "active" : ""} onClick={() => setTab("splits")}>
            <i>%</i>Splits
          </button>
          <button
            className={tab === "settings" ? "active" : ""}
            onClick={() => setTab("settings")}
          >
            <i>⚙</i>Configurações
          </button>
        </nav>
        <div className="sidebar-card">
          <span>Atalho rápido</span>
          <strong>Crie, salve e envie seus orçamentos em minutos.</strong>
          <button onClick={newBudget}>Criar agora →</button>
        </div>
        <div className="profile">
          <span>MG</span>
          <div>
            <strong>MG Refrigeração</strong>
            <small>Administrador</small>
          </div>
          <button className="logout-button" title="Sair" onClick={() => void supabase.auth.signOut({ scope: "local" })}>↪</button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">PAINEL DE ORÇAMENTOS</p>
            <h1>
              {tab === "new"
                ? preview
                  ? "Pré-visualização"
                  : "Novo orçamento"
                : tab === "saved" ? "Orçamentos"
                : tab === "clients" ? "Clientes"
                : tab === "services" ? "Catálogo de serviços"
                : tab === "splits" ? "Splits dos orçamentos"
                : "Configurações"}
            </h1>
            <p>
              {tab === "new"
                ? "Preencha os dados e gere uma proposta profissional."
                : tab === "saved" ? "Consulte e gerencie suas propostas comerciais."
                : tab === "clients" ? "Cadastre os clientes que serão usados nos orçamentos."
                : tab === "services" ? "Cadastre códigos, descrições e valores para preenchimento automático."
                : tab === "splits" ? "Acompanhe os 5% calculados sobre os orçamentos aprovados."
                : "Personalize os dados exibidos nos orçamentos."}
            </p>
          </div>
          {tab === "new" && (
            <div className="top-actions">
              <button
                className="button ghost"
                onClick={() => setPreview(!preview)}
              >
                {preview ? "← Editar" : "◉ Visualizar"}
              </button>
              <button className="button primary" onClick={saveBudget}>
                ✓ Salvar orçamento
              </button>
            </div>
          )}
          {tab === "saved" && (
            <button className="button primary" onClick={newBudget}>
              ＋ Novo orçamento
            </button>
          )}
        </header>

        {tab === "new" && !preview && (
          <div className="editor">
            <section className="card overview">
              <div className="section-title">
                <span>01</span>
                <div>
                  <h2>Identificação</h2>
                  <p>Dados básicos da proposta</p>
                </div>
              </div>
              <div className="form-grid three">
                <label>
                  Número do orçamento
                  <input
                    value={budget.number}
                    onChange={(e) =>
                      setBudget({ ...budget, number: e.target.value })
                    }
                  />
                </label>
                <label>
                  Data de emissão
                  <input
                    type="date"
                    value={budget.issuedAt}
                    onChange={(e) =>
                      setBudget({ ...budget, issuedAt: e.target.value })
                    }
                  />
                </label>
                <label>
                  Validade
                  <select
                    value={budget.validDays}
                    onChange={(e) =>
                      setBudget({
                        ...budget,
                        validDays: Number(e.target.value),
                      })
                    }
                  >
                    <option value={5}>5 dias</option>
                    <option value={10}>10 dias</option>
                    <option value={15}>15 dias</option>
                    <option value={30}>30 dias</option>
                  </select>
                </label>
              </div>
            </section>

            <section className="card">
              <div className="section-title">
                <span>02</span>
                <div>
                  <h2>Dados do cliente</h2>
                  <p>Quem receberá este orçamento?</p>
                </div>
              </div>
              <div className="form-grid">
                <label className="full">
                  Selecionar cliente cadastrado
                  <select value={budget.client.id || ""} onChange={(e) => selectClient(e.target.value)}>
                    <option value="">Preencher manualmente</option>
                    {clients.map((client) => <option key={client.id} value={client.id}>{client.name} · {client.document || "sem documento"}</option>)}
                  </select>
                </label>
                <label className="wide">
                  Nome / Razão social
                  <input
                    placeholder="Ex.: Empresa ou nome do cliente"
                    value={budget.client.name}
                    onChange={(e) => updateClient("name", e.target.value)}
                  />
                </label>
                <label>
                  CPF / CNPJ
                  <input
                    placeholder="000.000.000-00"
                    value={budget.client.document}
                    onChange={(e) => updateClient("document", e.target.value)}
                  />
                </label>
                <label>
                  Telefone
                  <input
                    placeholder="(85) 99999-9999"
                    value={budget.client.phone}
                    onChange={(e) => updateClient("phone", e.target.value)}
                  />
                </label>
                <label>
                  E-mail
                  <input
                    type="email"
                    placeholder="cliente@email.com"
                    value={budget.client.email}
                    onChange={(e) => updateClient("email", e.target.value)}
                  />
                </label>
                <label>
                  Contato
                  <input
                    placeholder="Pessoa de contato"
                    value={budget.client.contact}
                    onChange={(e) => updateClient("contact", e.target.value)}
                  />
                </label>
                <label className="wide">
                  Endereço
                  <input
                    placeholder="Rua, número e complemento"
                    value={budget.client.address}
                    onChange={(e) => updateClient("address", e.target.value)}
                  />
                </label>
                <label>
                  Cidade
                  <input
                    value={budget.client.city}
                    onChange={(e) => updateClient("city", e.target.value)}
                  />
                </label>
                <label className="short">
                  UF
                  <input
                    maxLength={2}
                    value={budget.client.state}
                    onChange={(e) =>
                      updateClient("state", e.target.value.toUpperCase())
                    }
                  />
                </label>
                <label>
                  CEP
                  <input
                    placeholder="00000-000"
                    value={budget.client.cep}
                    onChange={(e) => updateClient("cep", e.target.value)}
                  />
                </label>
              </div>
            </section>

            <section className="card items-card">
              <div className="section-heading">
                <div className="section-title">
                  <span>03</span>
                  <div>
                    <h2>Itens e serviços</h2>
                    <p>Adicione produtos, peças ou serviços</p>
                  </div>
                </div>
                <button className="button soft" onClick={addItem}>
                  ＋ Adicionar item
                </button>
              </div>
              <div className="items-table">
                <div className="item-head">
                  <span>Código</span>
                  <span>Descrição</span>
                  <span>Qtd.</span>
                  <span>Unidade</span>
                  <span>Valor unitário</span>
                  <span>Total</span>
                  <span></span>
                </div>
                {budget.items.map((item, index) => (
                  <div className="item-row" key={item.id}>
                    <input
                      list="service-codes"
                      placeholder="Código"
                      value={item.serviceCode || ""}
                      onChange={(e) => fillServiceByCode(item.id, e.target.value)}
                    />
                    <div className="description-field">
                      <b>{String(index + 1).padStart(2, "0")}</b>
                      <input
                        placeholder="Descreva o produto ou serviço"
                        value={item.description}
                        onChange={(e) =>
                          updateItem(item.id, "description", e.target.value)
                        }
                      />
                    </div>
                    <input
                      type="number"
                      min="0"
                      value={item.quantity}
                      onChange={(e) =>
                        updateItem(item.id, "quantity", Number(e.target.value))
                      }
                    />
                    <select
                      value={item.unit}
                      onChange={(e) =>
                        updateItem(item.id, "unit", e.target.value)
                      }
                    >
                      <option>un.</option>
                      <option>serv.</option>
                      <option>h</option>
                      <option>m</option>
                      <option>kg</option>
                    </select>
                    <div className="money-input">
                      <span>R$</span>
                      <input
                        type="number"
                        min="0"
                        step=".01"
                        value={item.unitPrice || ""}
                        placeholder="0,00"
                        onChange={(e) =>
                          updateItem(
                            item.id,
                            "unitPrice",
                            Number(e.target.value),
                          )
                        }
                      />
                    </div>
                    <strong>{money(item.quantity * item.unitPrice)}</strong>
                    <button
                      className="remove"
                      disabled={budget.items.length === 1}
                      onClick={() =>
                        setBudget((old) => ({
                          ...old,
                          items: old.items.filter((i) => i.id !== item.id),
                        }))
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
                <datalist id="service-codes">
                  {services.map((service) => <option key={service.id} value={service.code}>{service.description}</option>)}
                </datalist>
              </div>
              <div className="total-box">
                <span>Total do orçamento</span>
                <strong>{money(total)}</strong>
              </div>
            </section>

            <section className="card">
              <div className="section-title">
                <span>04</span>
                <div>
                  <h2>Condições comerciais</h2>
                  <p>Finalize os detalhes da proposta</p>
                </div>
              </div>
              <div className="form-grid">
                <label>
                  Condição de pagamento
                  <input
                    value={budget.payment}
                    onChange={(e) =>
                      setBudget({ ...budget, payment: e.target.value })
                    }
                  />
                </label>
                <label>
                  Status
                  <input value={budget.status} readOnly />
                </label>
                <div className="status-actions full">
                  <span>Próxima etapa</span>
                  {getAllowedNextStatuses(budget.status).filter((status) => status !== "Recusado").map((status) => (
                    <button key={status} className="button primary" onClick={() => advanceStatus(status)}>Avançar para {status}</button>
                  ))}
                  {getAllowedNextStatuses(budget.status).includes("Recusado") && (
                    <button className="button danger" onClick={() => advanceStatus("Recusado")}>Marcar como recusado</button>
                  )}
                  {getAllowedNextStatuses(budget.status).length === 0 && <strong>Status final: {budget.status}</strong>}
                </div>
                <label className="full">
                  Observações
                  <textarea
                    rows={4}
                    value={budget.notes}
                    onChange={(e) =>
                      setBudget({ ...budget, notes: e.target.value })
                    }
                  />
                </label>
              </div>
            </section>
          </div>
        )}

        {tab === "new" && preview && (
          <div className="preview-area">
            <div className="preview-tools">
              <span>
                Prévia em formato A4 · o PDF também ficará guardado no histórico
              </span>
              <button className="button primary" onClick={generateAndStorePdf}>
                ↧ Salvar e baixar PDF
              </button>
            </div>
            <article
              id="budget-pdf"
              className={`paper ${budget.items.length > 12 ? "paper-ultra" : budget.items.length > 7 ? "paper-dense" : ""}`}
            >
              <div className="paper-head">
                <img src="/MG.jpg" alt="MG Refrigeração" />
                <div>
                  <h2>MG REFRIGERAÇÃO</h2>
                  <p>Rua Francisco Calaça, 1688 · Fortaleza — CE</p>
                  <p>CEP 60.336-232 · (85) 98932-3113</p>
                  <p>CNPJ 31.263.081/0001-46 · matheuslegend10@icloud.com</p>
                </div>
                <div className="paper-number">
                  <span>ORÇAMENTO</span>
                  <strong>{budget.number}</strong>
                  <small>
                    Emissão:{" "}
                    {new Date(`${budget.issuedAt}T12:00:00`).toLocaleDateString(
                      "pt-BR",
                    )}
                  </small>
                </div>
              </div>
              <div className="paper-client">
                <span>CLIENTE</span>
                <h3>{budget.client.name || "Nome do cliente"}</h3>
                <div>
                  <p>
                    <b>CPF/CNPJ:</b> {budget.client.document || "—"}
                  </p>
                  <p>
                    <b>Telefone:</b> {budget.client.phone || "—"}
                  </p>
                  <p>
                    <b>E-mail:</b> {budget.client.email || "—"}
                  </p>
                  <p>
                    <b>Contato:</b> {budget.client.contact || "—"}
                  </p>
                </div>
                <p>
                  <b>Endereço:</b>{" "}
                  {[
                    budget.client.address,
                    budget.client.city,
                    budget.client.state,
                    budget.client.cep,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </p>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Descrição</th>
                    <th>Qtd.</th>
                    <th>Un.</th>
                    <th>Valor unit.</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {budget.items.map((item, index) => (
                    <tr key={item.id}>
                      <td>{String(index + 1).padStart(2, "0")}</td>
                      <td>{item.description || "Item ou serviço"}</td>
                      <td>{item.quantity}</td>
                      <td>{item.unit}</td>
                      <td>{money(item.unitPrice)}</td>
                      <td>{money(item.quantity * item.unitPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="paper-summary">
                <div>
                  <span>CONDIÇÕES COMERCIAIS</span>
                  <p>
                    <b>Pagamento:</b> {budget.payment}
                  </p>
                  <p>
                    <b>Validade do orçamento:</b> {budget.validDays} dias após a
                    emissão
                  </p>
                </div>
                <div>
                  <span>VALOR TOTAL</span>
                  <strong>{money(total)}</strong>
                </div>
              </div>
              <div className="paper-notes">
                <span>OBSERVAÇÕES</span>
                <p>{budget.notes || "Sem observações adicionais."}</p>
              </div>
              <div className="signatures">
                <div></div>
                <div></div>
                <p>MG Refrigeração</p>
                <p>{budget.client.name || "Cliente"}</p>
              </div>
              <footer>
                Obrigado pela preferência. Estamos à disposição para esclarecer
                qualquer dúvida.
              </footer>
            </article>
          </div>
        )}

        {tab === "saved" && (
          <section className="card saved-card">
            <div className="history-summary">
              <div>
                <strong>{saved.length}</strong>
                <span>orçamentos salvos</span>
              </div>
              <div>
                <strong>
                  {saved.filter((item) => item.pdfSavedAt).length}
                </strong>
                <span>PDFs guardados</span>
              </div>
              <p>
                Use os filtros para encontrar rapidamente sem acumular
                informações na tela.
              </p>
            </div>
            <div className="saved-toolbar">
              <div className="search">
                <span>⌕</span>
                <input
                  placeholder="Buscar cliente ou número..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
              <select
                aria-label="Filtrar por status"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option>Todos</option>
                <option>Enviado</option>
                <option>Recusado</option>
                <option>Em andamento</option>
                <option>Aprovado</option>
                <option>Pago</option>
              </select>
              <select
                aria-label="Filtrar por período"
                value={periodFilter}
                onChange={(e) => {
                  setPeriodFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="Todos">Todo o período</option>
                <option value="7">Últimos 7 dias</option>
                <option value="30">Últimos 30 dias</option>
                <option value="90">Últimos 90 dias</option>
              </select>
              <button className="clear-filter" onClick={clearFilters}>
                Limpar filtros
              </button>
              <span>{filtered.length} encontrados</span>
            </div>
            <div className="saved-table">
              <div className="saved-head">
                <span>Orçamento</span>
                <span>Cliente</span>
                <span>Emissão</span>
                <span>Valor</span>
                <span>Status</span>
                <span>PDF</span>
                <span>Ações</span>
              </div>
              {visibleBudgets.map((item) => (
                <div className="saved-row" key={item.id}>
                  <strong>{item.number}</strong>
                  <div>
                    <b>{item.client.name || "Cliente não informado"}</b>
                    <small>{item.client.phone || "Sem telefone"}</small>
                  </div>
                  <span>
                    {new Date(`${item.issuedAt}T12:00:00`).toLocaleDateString(
                      "pt-BR",
                    )}
                  </span>
                  <b>
                    {money(
                      item.items.reduce(
                        (sum, budgetItem) =>
                          sum + budgetItem.quantity * budgetItem.unitPrice,
                        0,
                      ),
                    )}
                  </b>
                  <em className={`status ${item.status.toLowerCase()}`}>
                    {item.status}
                  </em>
                  <button
                    className={item.pdfSavedAt ? "pdf-ready" : "pdf-missing"}
                    disabled={!item.pdfSavedAt}
                    onClick={() => downloadStoredPdf(item)}
                  >
                    {item.pdfSavedAt ? "Baixar PDF" : "Não gerado"}
                  </button>
                  <div className="row-actions">
                    <button onClick={() => openBudget(item)}>Abrir</button>
                    <button
                      className="delete-action"
                      onClick={() => removeBudget(item)}
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
              {visibleBudgets.length === 0 && (
                <div className="empty-history">
                  <strong>Nenhum orçamento encontrado</strong>
                  <span>
                    Tente limpar os filtros ou crie um novo orçamento.
                  </span>
                </div>
              )}
            </div>
            {filtered.length > HISTORY_PAGE_SIZE && (
              <div className="pagination">
                <button disabled={page === 1} onClick={() => setPage(page - 1)}>
                  ← Anterior
                </button>
                <span>
                  Página {page} de {pageCount}
                </span>
                <button
                  disabled={page === pageCount}
                  onClick={() => setPage(page + 1)}
                >
                  Próxima →
                </button>
              </div>
            )}
          </section>
        )}

        {tab === "clients" && (
          <section className="registry-layout">
            <div className="card registry-form" id="service-form">
              <div className="section-title"><span>01</span><div><h2>Cadastro de cliente</h2><p>Dados armazenados para reutilização</p></div></div>
              <div className="form-grid">
                <label className="wide">Nome / Razão social<input value={clientDraft.name} onChange={(e) => setClientDraft({ ...clientDraft, name: e.target.value })} /></label>
                <label>CPF / CNPJ<input value={clientDraft.document} onChange={(e) => setClientDraft({ ...clientDraft, document: e.target.value })} /></label>
                <label>Telefone<input value={clientDraft.phone} onChange={(e) => setClientDraft({ ...clientDraft, phone: e.target.value })} /></label>
                <label>E-mail<input value={clientDraft.email} onChange={(e) => setClientDraft({ ...clientDraft, email: e.target.value })} /></label>
                <label>Contato<input value={clientDraft.contact} onChange={(e) => setClientDraft({ ...clientDraft, contact: e.target.value })} /></label>
                <label className="wide">Endereço<input value={clientDraft.address} onChange={(e) => setClientDraft({ ...clientDraft, address: e.target.value })} /></label>
                <label>Cidade<input value={clientDraft.city} onChange={(e) => setClientDraft({ ...clientDraft, city: e.target.value })} /></label>
                <label>UF<input maxLength={2} value={clientDraft.state} onChange={(e) => setClientDraft({ ...clientDraft, state: e.target.value.toUpperCase() })} /></label>
                <label>CEP<input value={clientDraft.cep} onChange={(e) => setClientDraft({ ...clientDraft, cep: e.target.value })} /></label>
              </div>
              <button className="button primary registry-save" onClick={registerClient}>Salvar cliente</button>
            </div>
            <div className="card registry-list">
              <h2>Clientes cadastrados</h2>
              {clients.map((client) => <div className="registry-row" key={client.id}><div><strong>{client.name}</strong><small>{client.document || "Sem documento"} · {client.phone || "Sem telefone"}</small></div><button onClick={() => setClientDraft(client)}>Editar</button></div>)}
              {!clients.length && <p className="registry-empty">Nenhum cliente cadastrado.</p>}
            </div>
          </section>
        )}

        {tab === "services" && (
          <section className="registry-layout">
            <div className="card registry-form">
              <div className="section-title"><span>02</span><div><h2>Cadastro de serviço</h2><p>Esta tabela será ligada aos IDs do backend</p></div></div>
              <div className="form-grid">
                <label>Código<input placeholder="Ex.: SRV-001" value={serviceDraft.code} onChange={(e) => setServiceDraft({ ...serviceDraft, code: e.target.value.toUpperCase() })} /></label>
                <label className="wide">Serviço<input value={serviceDraft.description} onChange={(e) => setServiceDraft({ ...serviceDraft, description: e.target.value })} /></label>
                <label>Unidade<select value={serviceDraft.unit} onChange={(e) => setServiceDraft({ ...serviceDraft, unit: e.target.value })}><option>serv.</option><option>un.</option><option>h</option><option>m</option><option>kg</option></select></label>
                <label>Valor<input type="number" min="0" step=".01" value={serviceDraft.unitPrice || ""} onChange={(e) => setServiceDraft({ ...serviceDraft, unitPrice: Number(e.target.value) })} /></label>
              </div>
              <button className="button primary registry-save" onClick={registerService}>Salvar serviço</button>
            </div>
            <div className="card registry-list">
              <div className="registry-title"><h2>Planilha de serviços</h2><div className="registry-actions"><button className="button ghost" disabled={!services.length} onClick={downloadServicesPdf}>↧ Gerar PDF</button><button className="button soft" onClick={() => { setServiceDraft({ id: "", code: "", description: "", unit: "serv.", unitPrice: 0 }); document.getElementById("service-form")?.scrollIntoView({ behavior: "smooth" }); }}>＋ Adicionar serviço</button></div></div>
              <div id="service-pdf" className="services-paper">
                <div className="services-paper-head"><img src="/MG.jpg" alt="MG Refrigeração" /><div><h2>PLANILHA DE SERVIÇOS</h2><p>MG Refrigeração · Emitida em {new Date().toLocaleDateString("pt-BR")}</p></div></div>
                <div className="service-head pdf-service-head"><span>Código</span><span>Serviço</span><span>Unidade</span><span>Valor</span></div>
                {services.map((service) => <div className="service-row pdf-service-row" key={service.id}><code>{service.code}</code><div><strong>{service.description}</strong></div><span>{service.unit}</span><b>{money(service.unitPrice)}</b><button onClick={() => setServiceDraft(service)}>Editar</button></div>)}
                <footer>{services.length} serviço(s) cadastrado(s)</footer>
              </div>
              {!services.length && <p className="registry-empty">Cadastre um serviço para usar o preenchimento automático.</p>}
            </div>
          </section>
        )}

        {tab === "splits" && (
          <section className="card split-card">
            <div className="split-summary">
              <div><span>Percentual do split</span><strong>{SPLIT_RATE * 100}%</strong></div>
              <div><span>Orçamentos com split</span><strong>{splitBudgets.length}</strong></div>
              <div className="split-total"><span>Total acumulado dos splits</span><strong>{money(splitTotal)}</strong></div>
            </div>
            <div className="split-info">Somente orçamentos aprovados ou pagos entram no cálculo. Orçamentos recusados não geram split.</div>
            <div className="split-table">
              <div className="split-head"><span>Orçamento</span><span>Cliente</span><span>Status</span><span>Valor aprovado</span><span>Split (5%)</span></div>
              {splitBudgets.map((item) => (
                <div className="split-row" key={item.id}>
                  <strong>{item.number}</strong>
                  <div><b>{item.client.name || "Cliente não informado"}</b><small>{new Date(`${item.issuedAt}T12:00:00`).toLocaleDateString("pt-BR")}</small></div>
                  <em className={`status ${item.status.toLowerCase()}`}>{item.status}</em>
                  <span>{money(calculateBudgetTotal(item))}</span>
                  <strong>{money(calculateBudgetSplit(item))}</strong>
                </div>
              ))}
              {!splitBudgets.length && <div className="empty-history"><strong>Nenhum split calculado</strong><span>O valor aparecerá quando um orçamento for aprovado.</span></div>}
            </div>
          </section>
        )}

        {tab === "settings" && (
          <section className="settings-layout">
            <div className="settings-menu card">
              <button className="active">Empresa</button>
              <button>Preferências</button>
              <button>Numeração</button>
            </div>
            <div className="card settings-form">
              <div className="section-title">
                <span>MG</span>
                <div>
                  <h2>Dados da empresa</h2>
                  <p>Estas informações aparecem no orçamento</p>
                </div>
              </div>
              <div className="logo-upload">
                <img src="/MG.jpg" alt="Logo da MG" />
                <div>
                  <strong>Logotipo da empresa</strong>
                  <p>Identidade visual aplicada às propostas.</p>
                  <button
                    className="button ghost"
                    onClick={() => notify("Logo da MG já está configurada")}
                  >
                    Alterar logotipo
                  </button>
                </div>
              </div>
              <div className="form-grid">
                <label>
                  Razão social
                  <input defaultValue="MG Refrigeração" />
                </label>
                <label>
                  CNPJ
                  <input defaultValue="31.263.081/0001-46" />
                </label>
                <label>
                  Telefone
                  <input defaultValue="(85) 98932-3113" />
                </label>
                <label>
                  E-mail
                  <input defaultValue="matheuslegend10@icloud.com" />
                </label>
                <label className="full">
                  Endereço
                  <input defaultValue="Rua Francisco Calaça, 1688 — Fortaleza/CE — CEP 60.336-232" />
                </label>
              </div>
              <button
                className="button primary"
                onClick={() => notify("Configurações salvas")}
              >
                Salvar alterações
              </button>
            </div>
          </section>
        )}
      </main>
      {toast && <div className="toast">✓ {toast}</div>}
    </div>
  );
}
