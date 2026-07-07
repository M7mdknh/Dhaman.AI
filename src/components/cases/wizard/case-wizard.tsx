"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { startCaseAction, saveCompanyAction, saveContractAction, submitCaseAction } from "@/app/(app)/cases/actions";
import { Stepper, type WizardStep } from "@/components/cases/wizard/stepper";
import { CompanyStep } from "@/components/cases/wizard/company-step";
import { ContractStep } from "@/components/cases/wizard/contract-step";
import { DocumentsStep } from "@/components/cases/wizard/documents-step";
import { ReviewStep } from "@/components/cases/wizard/review-step";

import type { DocumentView } from "@/lib/case-view";
import type { CompanyInfoInput, ContractDetailsInput } from "@/lib/validation/case";

const STEPS: WizardStep[] = [
  { id: 1, label: "Company Information" },
  { id: 2, label: "Contract Details" },
  { id: 3, label: "Financial Statements" },
  { id: 4, label: "Review & Submit" },
];

interface CaseWizardProps {
  mode: "new" | "edit";
  caseId?: string;
  initialStep?: number;
  company: CompanyInfoInput;
  contract: ContractDetailsInput | null;
  documents: DocumentView[];
}

/**
 * Multi-step case wizard. All steps stay mounted (hidden via CSS) so form
 * state survives navigation between steps; each completed step is persisted
 * through a server action, so drafts auto-save as the user moves.
 */
export function CaseWizard(props: CaseWizardProps) {
  const router = useRouter();
  const isNew = props.mode === "new";
  const [step, setStep] = useState(isNew ? 1 : (props.initialStep ?? 1));
  const [company, setCompany] = useState(props.company);
  const [contract, setContract] = useState(props.contract);
  const [documents, setDocuments] = useState(props.documents);

  // In "new" mode the case does not exist yet — later steps unlock after
  // Step 1 creates the draft (which navigates to /cases/[id]/edit).
  const canOpen = (id: number) => {
    if (isNew) return id === 1;
    if (id <= 2) return true;
    return contract !== null;
  };

  const completedSteps = [
    ...(isNew ? [] : [1]),
    ...(contract ? [2] : []),
    ...(documents.length > 0 ? [3] : []),
  ];

  async function saveCompany(values: CompanyInfoInput) {
    const result = isNew
      ? await startCaseAction(values)
      : await saveCompanyAction(props.caseId!, values);
    if (result.ok) {
      setCompany(values);
      toast.success(isNew ? "Draft case created" : "Draft saved");
      if (isNew && result.caseId) {
        router.push(`/cases/${result.caseId}/edit?step=2`);
      } else {
        setStep(2);
      }
    }
    return result;
  }

  async function saveContract(values: ContractDetailsInput) {
    const result = await saveContractAction(props.caseId!, values);
    if (result.ok) {
      setContract(values);
      toast.success("Draft saved");
      setStep(3);
    }
    return result;
  }

  async function submitCase() {
    const result = await submitCaseAction(props.caseId!);
    if (result.ok) {
      toast.success("Case submitted — financial processing started");
      router.push(`/cases/${props.caseId}`);
    } else if (result.error) {
      toast.error(result.error);
    }
    return result;
  }

  return (
    <div className="space-y-6">
      <Stepper
        steps={STEPS}
        current={step}
        completedSteps={completedSteps}
        canOpen={canOpen}
        onSelect={setStep}
      />

      <div className={step === 1 ? undefined : "hidden"}>
        <CompanyStep defaults={company} isNew={isNew} onSave={saveCompany} />
      </div>

      {!isNew && (
        <>
          <div className={step === 2 ? undefined : "hidden"}>
            <ContractStep
              defaults={contract}
              onBack={() => setStep(1)}
              onSave={saveContract}
            />
          </div>
          <div className={step === 3 ? undefined : "hidden"}>
            <DocumentsStep
              caseId={props.caseId!}
              documents={documents}
              onDocumentsChange={setDocuments}
              onBack={() => setStep(2)}
              onContinue={() => setStep(4)}
            />
          </div>
          <div className={step === 4 ? undefined : "hidden"}>
            <ReviewStep
              company={company}
              contract={contract}
              documents={documents}
              onEdit={setStep}
              onSubmit={submitCase}
            />
          </div>
        </>
      )}
    </div>
  );
}
