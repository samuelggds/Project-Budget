export type MailFolder = "inbox" | "sent" | "draft" | "archive" | "trash";
export type MailStatus =
  | "received"
  | "draft"
  | "sending"
  | "sent"
  | "delivered"
  | "bounced"
  | "complained"
  | "failed";

export type MailAttachment = {
  id: string;
  messageId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  isInline: boolean;
};

export type MailMessage = {
  id: string;
  messageId: string;
  providerMessageId?: string;
  threadId: string;
  direction: "inbound" | "outbound";
  folder: MailFolder;
  status: MailStatus;
  fromAddress: string;
  fromName: string;
  toAddresses: string[];
  ccAddresses: string[];
  bccAddresses: string[];
  replyToAddresses: string[];
  subject: string;
  textBody: string;
  snippet: string;
  inReplyTo: string;
  references: string[];
  clientId?: string;
  budgetId?: string;
  receivedAt?: string;
  sentAt?: string;
  readAt?: string;
  createdAt: string;
  updatedAt: string;
  attachments: MailAttachment[];
};

export type MailDraft = {
  id?: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  text: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string[];
  budgetId?: string;
  clientId?: string;
};
