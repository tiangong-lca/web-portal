import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NavigationFeedbackProvider,
  PendingFeedback,
} from "@/components/shell/navigation-feedback";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
describe("navigation feedback lifecycle", () => {
  it("does not flash for fast work and clears cancelled work", () => {
    vi.useFakeTimers();
    const tree = (pending: boolean) => (
      <NavigationFeedbackProvider label="Loading">
        <PendingFeedback pending={pending} />
      </NavigationFeedbackProvider>
    );
    const view = render(tree(true));
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.queryByText("Loading")).toBeNull();
    view.rerender(tree(false));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByText("Loading")).toBeNull();
    view.rerender(tree(true));
    act(() => {
      vi.advanceTimersByTime(160);
    });
    expect(screen.getByText("Loading")).toBeInTheDocument();
    view.rerender(tree(false));
    expect(screen.queryByText("Loading")).toBeNull();
  });
  it("keeps feedback for concurrent work and cleans up the last unmounted request", () => {
    vi.useFakeTimers();
    const tree = (first: boolean, second: boolean) => (
      <NavigationFeedbackProvider label="Loading">
        {first && <PendingFeedback key="first" pending />}
        {second && <PendingFeedback key="second" pending />}
      </NavigationFeedbackProvider>
    );
    const view = render(tree(true, true));
    act(() => {
      vi.advanceTimersByTime(160);
    });
    view.rerender(tree(false, true));
    expect(screen.getByText("Loading")).toBeInTheDocument();
    view.rerender(tree(false, false));
    expect(screen.queryByText("Loading")).toBeNull();
  });
});
