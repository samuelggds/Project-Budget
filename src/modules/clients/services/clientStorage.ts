import type { Client } from "../types/Client";
import { readLocal, writeLocal } from "../../shared/services/localRepository";

const KEY = "mg-clientes";
export const listClients = () => readLocal<Client>(KEY);
export const persistClients = (clients: Client[]) => writeLocal(KEY, clients);
