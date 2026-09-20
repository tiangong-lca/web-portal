import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";
import { Button } from "@/components/ui/button";
import { FeedbackLink } from "@/components/shell/feedback-link";
import {
  NavigationFeedbackProvider,
  PendingFeedback,
} from "@/components/shell/navigation-feedback";
import { dictionaries, storyLocale } from "../fixtures";

function FeedbackExample({
  initialPending,
  startLabel,
  finishLabel,
  catalogLabel,
}: {
  initialPending: boolean;
  startLabel: string;
  finishLabel: string;
  catalogLabel: string;
}) {
  const [pending, setPending] = useState(initialPending);
  return (
    <div className="flex max-w-xl flex-wrap items-center gap-3 p-6">
      <Button
        onClick={() => setPending(true)}
        aria-busy={pending}
        className="portal-pending-control"
        data-pending={pending || undefined}
      >
        {startLabel}
      </Button>
      <Button onClick={() => setPending(false)} variant="outline">
        {finishLabel}
      </Button>
      <FeedbackLink href="/en/search" prefetch={false}>
        {catalogLabel}
      </FeedbackLink>
      <PendingFeedback pending={pending} />
    </div>
  );
}
const meta = {
  title: "Shell/Navigation feedback",
  component: NavigationFeedbackProvider,
  subcomponents: { FeedbackLink, PendingFeedback, Button },
  args: { label: "Loading…", children: null },
  parameters: { initialPending: false },
  render: (args, { globals, parameters }) => {
    const t = dictionaries[storyLocale(globals)].Common;
    return (
      <NavigationFeedbackProvider {...args} label={t.loading}>
        <FeedbackExample
          initialPending={parameters.initialPending}
          startLabel={t.search}
          finishLabel={t.close}
          catalogLabel={t.catalogCompact}
        />
      </NavigationFeedbackProvider>
    );
  },
} satisfies Meta<typeof NavigationFeedbackProvider>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Idle: Story = {};
export const Waiting: Story = {
  parameters: { initialPending: true },
  play: async ({ canvas, canvasElement, globals }) => {
    const t = dictionaries[storyLocale(globals)].Common;
    await expect(await canvas.findByText(t.loading)).toBeVisible();
    // One navigation shows one loading state: the global bar. The pending control
    // keeps its busy state, its progress cursor and its marker attribute, but no
    // local `::after` underline is generated on it or on any link.
    const control = canvas.getByRole("button", { name: t.search });
    await expect(control).toHaveAttribute("aria-busy", "true");
    await expect(window.getComputedStyle(control).cursor).toBe("progress");
    await expect(canvasElement.querySelector(".portal-route-progress")).toHaveAttribute(
      "data-pending",
      "true",
    );
    for (const element of [control, canvas.getByRole("link")]) {
      await expect(window.getComputedStyle(element, "::after").content).toBe("none");
    }
  },
};
export const CancelAndRetry: Story = {
  play: async ({ canvas, globals, userEvent }) => {
    const t = dictionaries[storyLocale(globals)].Common;
    await userEvent.click(canvas.getByRole("button", { name: t.search }));
    await expect(await canvas.findByText(t.loading)).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: t.close }));
    await expect(canvas.queryByText(t.loading)).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: t.search }));
    await expect(await canvas.findByText(t.loading)).toBeVisible();
  },
};
export const GermanDark: Story = { ...Waiting, globals: { theme: "dark", locale: "de" } };
