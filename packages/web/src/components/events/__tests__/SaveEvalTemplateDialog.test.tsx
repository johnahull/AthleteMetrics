/**
 * Unit tests for SaveEvalTemplateDialog: "Save metrics as template" on the event's Metrics tab (AM-FEAT-019 P5)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SaveEvalTemplateDialog } from "../SaveEvalTemplateDialog";

const mockApiRequest = vi.fn();
vi.mock("@/lib/queryClient", () => ({
  apiRequest: (...args: unknown[]) => mockApiRequest(...args),
}));
const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));

function renderDialog(props: Partial<React.ComponentProps<typeof SaveEvalTemplateDialog>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SaveEvalTemplateDialog eventId="evt-1" organizationId="org-1" canSave {...props} />
    </QueryClientProvider>
  );
}

describe("SaveEvalTemplateDialog", () => {
  const user = userEvent.setup();
  beforeEach(() => vi.clearAllMocks());

  it("is hidden for someone who cannot save templates", () => {
    const { container } = renderDialog({ canSave: false });
    expect(container).toBeEmptyDOMElement();
  });

  it("is hidden while the event has no metrics", () => {
    const { container } = renderDialog({ hasMetrics: false });
    expect(container).toBeEmptyDOMElement();
  });

  it("saves the event's metrics under the given name", async () => {
    mockApiRequest.mockResolvedValue({ json: async () => ({ id: "t1", name: "Spring battery" }) });
    renderDialog();
    await user.click(screen.getByRole("button", { name: "Save metrics as template" }));
    await user.type(screen.getByLabelText("Template name"), "  Spring battery ");
    await user.click(screen.getByRole("button", { name: "Save template" }));

    await waitFor(() => expect(mockApiRequest).toHaveBeenCalledWith("POST", "/api/events/evt-1/eval-templates", { name: "Spring battery" }));
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: "Template saved" }));
  });

  it("requires a name", async () => {
    renderDialog();
    await user.click(screen.getByRole("button", { name: "Save metrics as template" }));
    await user.click(screen.getByRole("button", { name: "Save template" }));
    expect(await screen.findByText(/enter a name/i)).toBeInTheDocument();
    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  it("shows the API's message when saving fails", async () => {
    mockApiRequest.mockRejectedValue(new Error('409: {"error":"A template with this name already exists"}'));
    renderDialog();
    await user.click(screen.getByRole("button", { name: "Save metrics as template" }));
    await user.type(screen.getByLabelText("Template name"), "Spring battery");
    await user.click(screen.getByRole("button", { name: "Save template" }));

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive", description: "A template with this name already exists" })
      )
    );
  });

  it("clears the name when the dialog is cancelled", async () => {
    renderDialog();
    await user.click(screen.getByRole("button", { name: "Save metrics as template" }));
    await user.type(screen.getByLabelText("Template name"), "Half typed");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Save metrics as template" }));
    expect(screen.getByLabelText("Template name")).toHaveValue("");
  });
});
