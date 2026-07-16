"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  saveCompanyAction,
  saveContractAction,
  saveQualitativeAction,
  startCaseAction,
  submitCaseAction,
} from "@/app/(app)/cases/actions";
import { Stepper, type WizardStep } from "@/components/cases/wizard/stepper";
import { CompanyStep } from "@/components/cases/wizard/company-step";
import { ContractStep } from "@/components/cases/wizard/contract-step";
import { DocumentsStep } from "@/components/cases/wizard/documents-step";
import { KycStep } from "@/components/cases/wizard/kyc-step";
import { ReviewStep } from "@/components/cases/wizard/review-step";

import type { DocumentView } from "@/lib/case-view";
import type {
  CaseQualitativeInput,
  CompanyInfoInput,
  ContractDetailsInput,
} from "@/lib/validation/case";

const STEPS: WizardStep[] = [
  { id: 1, label: "Company Information" },
  { id: 2, label: "Profile & Track Record" },
  { id: 3, label: "Contract Details" },
  { id: 4, label: "Financial Statements" },
  { id: 5, label: "Review & Submit" },
];

interface CaseWizardProps {
  mode: "new" | "edit";
  caseId?: string;
  initialStep?: number;
  company: CompanyInfoInput;
  qualitative: CaseQualitativeInput | null;
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
  const [qualitative, setQualitative] = useState(props.qualitative);
  const [contract, setContract] = useState(props.contract);
  const [documents, setDocuments] = useState(props.documents);

  const statements = documents.filter((d) => d.docType === "FINANCIAL_STATEMENT");
  const contractDocument = documents.find((d) => d.docType === "CONTRACT") ?? null;

  // In "new" mode the case does not exist yet — later steps unlock after
  // Step 1 creates the draft (which navigates to /cases/[id]/edit).
  const canOpen = (id: number) => {
    if (isNew) return id === 1;
    if (id <= 2) return true;
    if (id === 3) return qualitative !== null;
    if (id === 4) return qualitative !== null && contract !== null;
    // Review needs something to review — at least one statement uploaded.
    return qualitative !== null && contract !== null && statements.length > 0;
  };

  const completedSteps = [
    ...(isNew ? [] : [1]),
    ...(qualitative ? [2] : []),
    ...(contract ? [3] : []),
    ...(statements.length > 0 ? [4] : []),
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

  async function saveQualitative(values: CaseQualitativeInput) {
    const result = await saveQualitativeAction(props.caseId!, values);
    if (result.ok) {
      setQualitative(values);
      toast.success("Draft saved");
      setStep(3);
    }
    return result;
  }

  async function saveContract(values: ContractDetailsInput) {
    const result = await saveContractAction(props.caseId!, values);
    if (result.ok) {
      // Display-only echo of the amount the case service just derived
      // server-side (contractValue * guaranteePercentage / 100) — so the
      // Review step shows the same figure without an extra round trip.
      const derivedAmount = (
        (Number(values.contractValue) * Number(values.guaranteePercentage)) /
        100
      ).toFixed(2);
      setContract({ ...values, guaranteeAmount: derivedAmount });
      toast.success("Draft saved");
      setStep(4);
    }
    return result;
  }

  function handleContractDocument(document: DocumentView | null) {
    setDocuments((docs) => {
      const withoutContract = docs.filter((d) => d.docType !== "CONTRACT");
      return document ? [...withoutContract, document] : withoutContract;
    });
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
            <KycStep
              defaults={qualitative}
              onBack={() => setStep(1)}
              onSave={saveQualitative}
            />
          </div>
          <div className={step === 3 ? undefined : "hidden"}>
            <ContractStep
              caseId={props.caseId ?? null}
              defaults={contract}
              contractDocument={contractDocument}
              onContractDocumentChange={handleContractDocument}
              onBack={() => setStep(2)}
              onSave={saveContract}
            />
          </div>
          <div className={step === 4 ? undefined : "hidden"}>
            <DocumentsStep
              caseId={props.caseId!}
              documents={documents}
              onDocumentsChange={setDocuments}
              onBack={() => setStep(3)}
              onContinue={() => setStep(5)}
            />
          </div>
          <div className={step === 5 ? undefined : "hidden"}>
            <ReviewStep
              company={company}
              qualitative={qualitative}
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
