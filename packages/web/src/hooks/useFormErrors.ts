import { useFormContext } from "react-hook-form";
import type { FormError } from "@/components/ui/form-error-summary";

export function useFormErrors() {
  const { formState: { errors } } = useFormContext();

  // Convert React Hook Form errors to FormError array
  const formErrors: FormError[] = Object.entries(errors).map(([field, error]) => ({
    field,
    message: (error?.message as string) || "This field is required",
    ref: error?.ref as React.RefObject<HTMLElement> | undefined,
  }));

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
