import { describe, expect, it } from "vitest";
import { questionKindLabelPtBr } from "@/domain/questions/questionLabels";

describe("question type labels", () => {
  it("translates the internal performance codes", () => {
    expect(questionKindLabelPtBr("CLASSIFY")).toBe("Classificar");
    expect(questionKindLabelPtBr("DIALOGUE_ORDER")).toBe("Organizar diálogo");
    expect(questionKindLabelPtBr("DICTATION")).toBe("Ditado");
    expect(questionKindLabelPtBr("FB")).toBe("Completar lacuna");
    expect(questionKindLabelPtBr("LISTENING_MC")).toBe("Compreensão auditiva");
  });
});
