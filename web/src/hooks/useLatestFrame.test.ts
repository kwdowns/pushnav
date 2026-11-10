import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLatestFrame } from "./useLatestFrame";

describe("useLatestFrame", () => {
  let urls = 0;

  beforeEach(() => {
    urls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Blob(["jpeg"]), { status: 200 })),
    );
    URL.createObjectURL = vi.fn(() => `blob:frame-${++urls}`);
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches nothing without a frame", () => {
    const { result } = renderHook(() => useLatestFrame(null));
    expect(result.current).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetches a frame per new id and revokes the previous URL", async () => {
    const { result, rerender } = renderHook(({ id }) => useLatestFrame(id), {
      initialProps: { id: 1 as number | null },
    });
    await waitFor(() => expect(result.current).toBe("blob:frame-1"));
    expect(fetch).toHaveBeenCalledWith("/frame.jpg?id=1", { cache: "no-store" });

    rerender({ id: 1 }); // same frame: no new fetch
    rerender({ id: 2 });
    await waitFor(() => expect(result.current).toBe("blob:frame-2"));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:frame-1");
  });

  it("keeps the last good frame when a fetch fails", async () => {
    const { result, rerender } = renderHook(({ id }) => useLatestFrame(id), {
      initialProps: { id: 1 },
    });
    await waitFor(() => expect(result.current).toBe("blob:frame-1"));
    vi.mocked(fetch).mockResolvedValueOnce(new Response("", { status: 404 }));
    await act(async () => rerender({ id: 2 }));
    expect(result.current).toBe("blob:frame-1");
  });

  it("catches up with a frame that arrived during a fetch", async () => {
    let release!: () => void;
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(new Response(new Blob(["a"])));
        }),
    );
    const { result, rerender } = renderHook(({ id }) => useLatestFrame(id), {
      initialProps: { id: 1 },
    });
    rerender({ id: 2 }); // arrives while frame 1 is still loading
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => release());
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(fetch).toHaveBeenLastCalledWith("/frame.jpg?id=2", { cache: "no-store" });
    await waitFor(() => expect(result.current).toBe("blob:frame-2"));
  });
});
