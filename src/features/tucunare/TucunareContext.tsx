import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export interface TutorStudyContext {
  lessonId?: number;
  questionId?: number;
  questionView?: string;
  questionLabel?: string;
}
type Practice = { materialKey: string; message: string };
const Context = createContext<{
  study: TutorStudyContext | null;
  setStudy: (study: TutorStudyContext | null) => void;
  practice: Practice | null;
  setPractice: (practice: Practice | null) => void;
} | null>(null);

export function TucunareProvider({ children }: { children: ReactNode }) {
  const [study, setStudy] = useState<TutorStudyContext | null>(null);
  const [practice, setPractice] = useState<Practice | null>(null);
  const value = useMemo(() => ({ study, setStudy, practice, setPractice }), [study, practice]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useTucunareContext = () => useContext(Context);
