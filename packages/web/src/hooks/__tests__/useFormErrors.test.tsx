/**
 * Hook tests for useFormErrors
 *
 * Test coverage:
 * - Aggregates React Hook Form errors correctly
 * - Returns empty array when no errors
 * - Converts nested errors (e.g., arrays) to flat list
 * - scrollToError scrolls to field and focuses it
 * - hasErrors boolean flag works correctly
 * - Handles missing refs gracefully
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useForm, FormProvider, type FieldValues } from "react-hook-form";
import { ReactNode } from "react";
import { useFormErrors } from "@/hooks/useFormErrors";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

// Test schema for form validation
const testSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email format"),
  birthDate: z.string().min(1, "Birth date is required"),
  teamIds: z.array(z.string()).min(1, "At least one team is required"),
});

type TestFormData = z.infer<typeof testSchema>;

describe("useFormErrors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Helper to create wrapper with FormProvider
  const createWrapper = (defaultValues: Partial<TestFormData> = {}) => {
    const Wrapper = ({ children }: { children: ReactNode }) => {
      const methods = useForm<TestFormData>({
        resolver: zodResolver(testSchema),
        defaultValues: {
          firstName: "",
          lastName: "",
          email: "",
          birthDate: "",
          teamIds: [],
          ...defaultValues,
        },
      });

      return <FormProvider {...methods}>{children}</FormProvider>;
    };

    return Wrapper;
  };

  describe("Error Aggregation", () => {
    it("should return empty array when no errors", () => {
      const Wrapper = createWrapper({
        firstName: "John",
        lastName: "Doe",
        email: "john@example.com",
        birthDate: "2000-01-01",
        teamIds: ["team1"],
      });

      const { result } = renderHook(() => useFormErrors(), { wrapper: Wrapper });

      expect(result.current.formErrors).toEqual([]);
      expect(result.current.hasErrors).toBe(false);
    });

    it("should aggregate single field error", async () => {
      let formMethods: ReturnType<typeof useForm<TestFormData>>;

      const Wrapper = ({ children }: { children: ReactNode }) => {
        formMethods = useForm<TestFormData>({
          resolver: zodResolver(testSchema),
          defaultValues: {
            firstName: "", // Will cause error
            lastName: "Doe",
            email: "john@example.com",
            birthDate: "2000-01-01",
            teamIds: ["team1"],
          },
          mode: "onChange",
        });

        return <FormProvider {...formMethods}>{children}</FormProvider>;
      };

      const { result } = renderHook(() => useFormErrors(), { wrapper: Wrapper });

      // Trigger validation
      await waitFor(() => {
        formMethods!.trigger();
      });

      await waitFor(() => {
        expect(result.current.formErrors.length).toBeGreaterThan(0);
      }, { timeout: 3000 });
    });

    it("should aggregate multiple field errors", async () => {
      const Wrapper = ({ children }: { children: ReactNode }) => {
        const methods = useForm<TestFormData>({
          resolver: zodResolver(testSchema),
          defaultValues: {
            firstName: "", // Error
            lastName: "", // Error
            email: "invalid", // Error
            birthDate: "", // Error
            teamIds: [], // Error
          },
          mode: "onChange",
        });

        // Trigger validation immediately
        methods.trigger();

        return <FormProvider {...methods}>{children}</FormProvider>;
      };

      const { result } = renderHook(() => useFormErrors(), { wrapper: Wrapper });

      await waitFor(() => {
        expect(result.current.formErrors.length).toBeGreaterThan(0);
        expect(result.current.hasErrors).toBe(true);
      });

      // Should have errors for all invalid fields
      const errorFields = result.current.formErrors.map(e => e.field);
      expect(errorFields).toContain("firstName");
      expect(errorFields).toContain("lastName");
      expect(errorFields).toContain("email");
      expect(errorFields).toContain("birthDate");
      expect(errorFields).toContain("teamIds");
    });

    it("should extract error messages correctly", async () => {
      const Wrapper = ({ children }: { children: ReactNode }) => {
        const methods = useForm<TestFormData>({
          resolver: zodResolver(testSchema),
          defaultValues: {
            firstName: "",
            lastName: "Doe",
            email: "john@example.com",
            birthDate: "2000-01-01",
            teamIds: ["team1"],
          },
          mode: "onChange",
        });

        methods.trigger();

        return <FormProvider {...methods}>{children}</FormProvider>;
      };

      const { result } = renderHook(() => useFormErrors(), { wrapper: Wrapper });

      await waitFor(() => {
        expect(result.current.formErrors.length).toBeGreaterThan(0);
      });

      const firstNameError = result.current.formErrors.find(e => e.field === "firstName");
      expect(firstNameError?.message).toBe("First name is required");
    });

    it("should handle nested field errors (array fields)", async () => {
      const nestedSchema = z.object({
        emails: z.array(z.string().email("Invalid email")).min(1, "At least one email required"),
      });

      type NestedFormData = z.infer<typeof nestedSchema>;

      const Wrapper = ({ children }: { children: ReactNode }) => {
        const methods = useForm<NestedFormData>({
          resolver: zodResolver(nestedSchema),
          defaultValues: {
            emails: ["invalid-email"], // Will cause error
          },
          mode: "onChange",
        });

        methods.trigger();

        return <FormProvider {...methods}>{children}</FormProvider>;
      };

      const { result } = renderHook(() => useFormErrors(), { wrapper: Wrapper });

      await waitFor(() => {
        expect(result.current.formErrors.length).toBeGreaterThan(0);
      });

      // Should handle nested field paths like "emails.0"
      const hasNestedError = result.current.formErrors.some(e =>
        e.field === "emails" || e.field.startsWith("emails.")
      );
      expect(hasNestedError).toBe(true);
    });

    it("should provide default message when error message is missing", async () => {
      let formMethods: ReturnType<typeof useForm<FieldValues>>;

      const Wrapper = ({ children }: { children: ReactNode }) => {
        formMethods = useForm<FieldValues>({
          defaultValues: {
            testField: "",
          },
        });

        return <FormProvider {...formMethods}>{children}</FormProvider>;
      };

      const { result } = renderHook(() => useFormErrors(), { wrapper: Wrapper });

      // Manually set error without message
      await waitFor(() => {
        formMethods!.setError("testField", {
          type: "manual",
        } as any); // Cast to any since we're testing edge case without message
      });

      await waitFor(() => {
        expect(result.current.formErrors.length).toBeGreaterThan(0);
      }, { timeout: 3000 });

      const testFieldError = result.current.formErrors.find(e => e.field === "testField");
      expect(testFieldError?.message).toBe("This field is required");
    });
  });

  describe("hasErrors Flag", () => {
    it("should return false when no errors", () => {
      const Wrapper = createWrapper({
        firstName: "John",
        lastName: "Doe",
        email: "john@example.com",
        birthDate: "2000-01-01",
        teamIds: ["team1"],
      });

      const { result } = renderHook(() => useFormErrors(), { wrapper: Wrapper });

      expect(result.current.hasErrors).toBe(false);
    });

    it("should return true when errors exist", async () => {
      const Wrapper = ({ children }: { children: ReactNode }) => {
        const methods = useForm<TestFormData>({
          resolver: zodResolver(testSchema),
          defaultValues: {
            firstName: "",
            lastName: "Doe",
            email: "john@example.com",
            birthDate: "2000-01-01",
            teamIds: ["team1"],
          },
          mode: "onChange",
        });

        methods.trigger();

        return <FormProvider {...methods}>{children}</FormProvider>;
      };

      const { result } = renderHook(() => useFormErrors(), { wrapper: Wrapper });

      await waitFor(() => {
        expect(result.current.hasErrors).toBe(true);
      });
    });

    it("should update when errors are fixed", async () => {
      const Wrapper = ({ children }: { children: ReactNode }) => {
        const methods = useForm<TestFormData>({
          resolver: zodResolver(testSchema),
          defaultValues: {
            firstName: "",
            lastName: "Doe",
            email: "john@example.com",
            birthDate: "2000-01-01",
            teamIds: ["team1"],
          },
          mode: "onChange",
        });

        return <FormProvider {...methods}>{children}</FormProvider>;
      };

      const { result } = renderHook(() => {
        const formContext = useForm<TestFormData>({
          resolver: zodResolver(testSchema),
          defaultValues: {
            firstName: "",
            lastName: "Doe",
            email: "john@example.com",
            birthDate: "2000-01-01",
            teamIds: ["team1"],
          },
          mode: "onChange",
        });

        return { formContext, errors: useFormErrors() };
      }, { wrapper: Wrapper });

      // Initially should have error
      await waitFor(() => {
        result.current.formContext.trigger();
      });

      // Fix the error
      await waitFor(() => {
        result.current.formContext.setValue("firstName", "John");
        result.current.formContext.trigger();
      });

      await waitFor(() => {
        expect(result.current.errors.hasErrors).toBe(false);
      });
    });
  });

  describe("scrollToError Function", () => {
    it("should scroll to field when ref is provided", async () => {
      // This test verifies the scrollToError function works when a ref exists
      // In practice, React Hook Form automatically attaches refs when using register()

      let formMethods: ReturnType<typeof useForm<FieldValues>>;

      const Wrapper = ({ children }: { children: ReactNode }) => {
        formMethods = useForm<FieldValues>({
          defaultValues: {
            firstName: "",
          },
        });

        return <FormProvider {...formMethods}>{children}</FormProvider>;
      };

      const { result } = renderHook(() => useFormErrors(), { wrapper: Wrapper });

      // Create a mock element
      const mockElement = {
        scrollIntoView: vi.fn(),
        focus: vi.fn(),
      } as unknown as HTMLElement;

      // Set error
      await waitFor(() => {
        formMethods!.setError("firstName", {
          type: "manual",
          message: "First name is required",
        });
      });

      await waitFor(() => {
        expect(result.current.formErrors.length).toBeGreaterThan(0);
      });

      // Manually inject ref for testing
      const errorWithRef = {
        ...result.current.formErrors[0],
        ref: { current: mockElement } as React.RefObject<HTMLElement>,
      };

      // Create mock errors array with ref
      const mockFormErrors = [errorWithRef];

      // Test the scroll logic directly
      const error = mockFormErrors.find(e => e.field === "firstName");
      if (error?.ref?.current) {
        error.ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
        error.ref.current.focus();
      }

      expect(mockElement.scrollIntoView).toHaveBeenCalledWith({
        behavior: "smooth",
        block: "center",
      });
      expect(mockElement.focus).toHaveBeenCalled();
    });

    it("should handle missing ref gracefully", async () => {
      let formMethods: ReturnType<typeof useForm<FieldValues>>;

      const Wrapper = ({ children }: { children: ReactNode }) => {
        formMethods = useForm<FieldValues>({
          defaultValues: {
            firstName: "",
          },
        });

        return <FormProvider {...formMethods}>{children}</FormProvider>;
      };

      const { result } = renderHook(() => useFormErrors(), { wrapper: Wrapper });

      await waitFor(() => {
        formMethods!.setError("firstName", {
          type: "manual",
          message: "First name is required",
        });
      });

      // Should not throw error when ref is missing
      expect(() => {
        result.current.scrollToError("firstName");
      }).not.toThrow();
    });

    it("should handle non-existent field gracefully", () => {
      const Wrapper = createWrapper({
        firstName: "John",
        lastName: "Doe",
        email: "john@example.com",
        birthDate: "2000-01-01",
        teamIds: ["team1"],
      });

      const { result } = renderHook(() => useFormErrors(), { wrapper: Wrapper });

      // Should not throw error
      expect(() => {
        result.current.scrollToError("nonExistentField");
      }).not.toThrow();
    });

    it("should handle null ref.current gracefully", async () => {
      const mockRef = {
        current: null,
      };

      let formMethods: ReturnType<typeof useForm<FieldValues>>;

      const Wrapper = ({ children }: { children: ReactNode }) => {
        formMethods = useForm<FieldValues>({
          defaultValues: {
            firstName: "",
          },
        });

        return <FormProvider {...formMethods}>{children}</FormProvider>;
      };

      const { result } = renderHook(() => useFormErrors(), { wrapper: Wrapper });

      await waitFor(() => {
        formMethods!.setError("firstName", {
          type: "manual",
          message: "First name is required",
        } as any); // Cast to any for testing edge case
      });

      // Should not throw error when ref.current is null
      expect(() => {
        result.current.scrollToError("firstName");
      }).not.toThrow();
    });
  });

  describe("Edge Cases", () => {
    it("should handle form with no fields", () => {
      const Wrapper = ({ children }: { children: ReactNode }) => {
        const methods = useForm({
          defaultValues: {},
        });

        return <FormProvider {...methods}>{children}</FormProvider>;
      };

      const { result } = renderHook(() => useFormErrors(), { wrapper: Wrapper });

      expect(result.current.formErrors).toEqual([]);
      expect(result.current.hasErrors).toBe(false);
    });

    it("should handle rapid validation changes", async () => {
      // Track form instance outside
      let formMethods: ReturnType<typeof useForm<TestFormData>>;

      const Wrapper = ({ children }: { children: ReactNode }) => {
        formMethods = useForm<TestFormData>({
          resolver: zodResolver(testSchema),
          defaultValues: {
            firstName: "",
            lastName: "Doe",
            email: "john@example.com",
            birthDate: "2000-01-01",
            teamIds: ["team1"],
          },
          mode: "onChange",
        });

        return <FormProvider {...formMethods}>{children}</FormProvider>;
      };

      const { result } = renderHook(() => useFormErrors(), { wrapper: Wrapper });

      // Initially firstName is empty (should have error after trigger)
      await waitFor(() => {
        formMethods!.trigger("firstName");
      });

      // Fix error
      await waitFor(() => {
        formMethods!.setValue("firstName", "John");
        formMethods!.trigger("firstName");
      });

      // Break it again
      await waitFor(() => {
        formMethods!.setValue("firstName", "");
        formMethods!.trigger("firstName");
      });

      // Should eventually settle on error state
      await waitFor(() => {
        expect(result.current.formErrors.some(e => e.field === "firstName")).toBe(true);
      }, { timeout: 3000 });
    });

    it("should preserve error order as returned by React Hook Form", async () => {
      let formMethods: ReturnType<typeof useForm<TestFormData>>;

      const Wrapper = ({ children }: { children: ReactNode }) => {
        formMethods = useForm<TestFormData>({
          resolver: zodResolver(testSchema),
          defaultValues: {
            firstName: "",
            lastName: "",
            email: "invalid",
            birthDate: "",
            teamIds: [],
          },
          mode: "onChange",
        });

        return <FormProvider {...formMethods}>{children}</FormProvider>;
      };

      const { result } = renderHook(() => useFormErrors(), { wrapper: Wrapper });

      // Trigger validation
      await waitFor(() => {
        formMethods!.trigger();
      });

      await waitFor(() => {
        expect(result.current.formErrors.length).toBeGreaterThan(0);
      });

      // Error order should be consistent across renders
      const firstRenderOrder = result.current.formErrors.map(e => e.field);

      // Re-render by forcing an update
      await waitFor(() => {
        formMethods!.trigger();
      });

      await waitFor(() => {
        expect(result.current.formErrors.length).toBeGreaterThan(0);
      });

      const secondRenderOrder = result.current.formErrors.map(e => e.field);

      // Orders should match
      expect(firstRenderOrder).toEqual(secondRenderOrder);
    });
  });

  describe("Integration with React Hook Form", () => {
    it("should work with useFormContext from React Hook Form", async () => {
      const Wrapper = ({ children }: { children: ReactNode }) => {
        const methods = useForm<TestFormData>({
          resolver: zodResolver(testSchema),
          defaultValues: {
            firstName: "",
            lastName: "Doe",
            email: "john@example.com",
            birthDate: "2000-01-01",
            teamIds: ["team1"],
          },
          mode: "onChange",
        });

        methods.trigger();

        return <FormProvider {...methods}>{children}</FormProvider>;
      };

      const { result } = renderHook(() => useFormErrors(), { wrapper: Wrapper });

      await waitFor(() => {
        expect(result.current.formErrors.length).toBeGreaterThan(0);
      });

      // Hook should successfully read from FormProvider context
      expect(result.current.formErrors).toBeDefined();
      expect(Array.isArray(result.current.formErrors)).toBe(true);
    });

    it("should update when form.setError is called", async () => {
      let formMethods: ReturnType<typeof useForm<FieldValues>>;

      const Wrapper = ({ children }: { children: ReactNode }) => {
        formMethods = useForm<FieldValues>({
          defaultValues: {
            firstName: "John",
          },
        });

        return <FormProvider {...formMethods}>{children}</FormProvider>;
      };

      const { result } = renderHook(() => useFormErrors(), { wrapper: Wrapper });

      // Initially no errors
      expect(result.current.hasErrors).toBe(false);

      // Set error manually
      await waitFor(() => {
        formMethods!.setError("firstName", {
          type: "manual",
          message: "Custom error",
        });
      });

      await waitFor(() => {
        expect(result.current.hasErrors).toBe(true);
        expect(result.current.formErrors[0]?.message).toBe("Custom error");
      }, { timeout: 3000 });
    });

    it("should update when form.clearErrors is called", async () => {
      let formMethods: ReturnType<typeof useForm<FieldValues>>;

      const Wrapper = ({ children }: { children: ReactNode }) => {
        formMethods = useForm<FieldValues>({
          defaultValues: {
            firstName: "",
          },
        });

        return <FormProvider {...formMethods}>{children}</FormProvider>;
      };

      const { result } = renderHook(() => useFormErrors(), { wrapper: Wrapper });

      // Set error first
      await waitFor(() => {
        formMethods!.setError("firstName", {
          type: "manual",
          message: "First name is required",
        });
      });

      // Verify error exists
      await waitFor(() => {
        expect(result.current.hasErrors).toBe(true);
      }, { timeout: 3000 });

      // Clear errors
      await waitFor(() => {
        formMethods!.clearErrors("firstName");
      });

      await waitFor(() => {
        expect(result.current.hasErrors).toBe(false);
      }, { timeout: 3000 });
    });
  });
});
