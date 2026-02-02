import { ReactNode } from "react";

export interface AuthenticatedPageProps {
  allowedRoles: string[];
  children: ReactNode;
}
