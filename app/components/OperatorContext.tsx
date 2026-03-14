"use client";

import { createContext, useContext } from "react";
import { OperatorConfig, DEFAULT_OPERATOR, getOperator } from "@/lib/operators";

const OperatorContext = createContext<OperatorConfig>(DEFAULT_OPERATOR);

export function useOperator(): OperatorConfig {
  return useContext(OperatorContext);
}

export function OperatorProvider({
  operatorSlug,
  children,
}: {
  operatorSlug: string;
  children: React.ReactNode;
}) {
  const config = getOperator(operatorSlug);
  return (
    <OperatorContext.Provider value={config}>
      {children}
    </OperatorContext.Provider>
  );
}
