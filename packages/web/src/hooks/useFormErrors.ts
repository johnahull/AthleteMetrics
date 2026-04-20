import { useFormContext } from "react-hook-form";
import type { FormError } from "@/components/ui/form-error-summary";

export function useFormErrors() {
  const { formState: { errors } } = useFormContext();

  // react-hook-form's FieldErrors values are a union (FieldError | nested shapes).
  // Only FieldError carries `ref`; narrow via property check before accessing it.
  const formErrors: FormError[] = Object.entries(errors).map(([field, error]) => {
    const ref = error && typeof error === "object" && "ref" in error
      ? (error.ref as React.RefObject<HTMLElement> | undefined)
      : undefined;
    return {
      field,
      message: (error?.message as string) || "This field is required",
      ref,
    };
  });

  const scrollToError = (field: string) => {
    const error = formErrors.find(e => e.field === field);
    if (error?.ref?.current) {
      error.ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
      error.ref.current.focus();
    }
  };

  return {
    formErrors,
    scrollToError,
    hasErrors: formErrors.length > 0,
  };
}
