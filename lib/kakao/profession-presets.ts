export type LocalProfessionPreset = "agent" | "lawyer" | "attorney" | "tax";

export const LOCAL_PROFESSION_PRESETS: Record<
  LocalProfessionPreset,
  { query: string; label: string }
> = {
  agent: { query: "공인중개사", label: "공인중개사" },
  lawyer: { query: "법무사", label: "법무사" },
  attorney: { query: "변호사", label: "변호사" },
  tax: { query: "세무회계", label: "세무·회계" },
};
