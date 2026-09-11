"use client";

import { createContext, useContext, type Dispatch, type ReactNode, type SetStateAction } from "react";

type TopbarContentContextValue = {
  leadingContent: ReactNode;
  setLeadingContent: Dispatch<SetStateAction<ReactNode>>;
};

const TopbarContentContext = createContext<TopbarContentContextValue | null>(null);

export function TopbarContentProvider({
  children,
  leadingContent,
  setLeadingContent,
}: TopbarContentContextValue & { children: ReactNode }) {
  return (
    <TopbarContentContext.Provider value={{ leadingContent, setLeadingContent }}>
      {children}
    </TopbarContentContext.Provider>
  );
}

export function useTopbarContent() {
  const context = useContext(TopbarContentContext);
  if (!context) {
    throw new Error("useTopbarContent must be used within TopbarContentProvider");
  }
  return context;
}
