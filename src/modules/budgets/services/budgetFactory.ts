import type { Budget } from "../types/Budget";

export const emptyClient = {
  id: "",
  name: "",
  document: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  state: "CE",
  cep: "",
  contact: "",
};

export function createInitialBudget(): Budget {
  return {
    id: crypto.randomUUID(),
    number: "ORC-01",
    issuedAt: new Date().toISOString().slice(0, 10),
    validDays: 5,
    status: "Enviado",
    client: { ...emptyClient },
    payment: "PIX",
    notes:
      "Materiais e mão de obra inclusos. Garantia de 90 dias para os serviços executados.",
    items: [
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
    updatedAt: new Date().toISOString(),
  };
}

export function createNextBudget(saved: Budget[]): Budget {
  const highest = Math.max(
    0,
    ...saved.map((budget) => {
      const match = budget.number.match(/^ORC-(\d+)$/i);
      return match ? Math.max(0, Number.parseInt(match[1], 10)) : 0;
    }),
  );
  const nextNumber = Math.max(1, highest + 1);

  return {
    ...createInitialBudget(),
    number: `ORC-${String(nextNumber).padStart(2, "0")}`,
  };
}
