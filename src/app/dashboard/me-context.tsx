"use client";
import { createContext, useContext } from "react";

export type Me = {
  user: { id: string; name: string; email: string };
  activeCompanyId: string | null;
  companies: { id: string; name: string; role: string; permissions: string[] }[];
};

export const MeContext = createContext<{ me: Me | null; can: (p: string) => boolean; reload: () => void }>({
  me: null, can: () => false, reload: () => {},
});
export const useMe = () => useContext(MeContext);
