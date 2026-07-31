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
    number: "ORC-1029",
    issuedAt: new Date().toISOString().slice(0, 10),
    validDays: 5,
    status: "Enviado",
    client: { ...emptyClient },
    payment: "50% de entrada + 50% na conclusão",
    notes:
      "Materiais e mão de obra inclusos. Garantia de 90 dias para os serviços executados.",
    items: [
      {
        id: crypto.randomUUID(),
        serviceId: "",
        serviceCode: "",
        description: "",
        quantity: 1,
        unit: "serv.",
        unitPrice: 0,
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}

export function createNextBudget(saved: Budget[]): Budget {
  const highest = Math.max(
    1028,
    ...saved.map((budget) => Number(budget.number.replace(/\D/g, "")) || 0),
  );
  return { ...createInitialBudget(), number: `ORC-${highest + 1}` };
}
