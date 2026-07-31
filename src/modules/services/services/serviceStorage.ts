import type { Service } from "../types/Service";
import { readLocal, writeLocal } from "../../shared/services/localRepository";

const KEY = "mg-servicos";
export const listServices = () => readLocal<Service>(KEY);
export const persistServices = (services: Service[]) => writeLocal(KEY, services);
