import { useState } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { Button } from "./button"
import { ListRow, List } from "./list"
import { SegmentedControl } from "./segmented-control"
import { SliderField } from "./slider-field"

describe("SliderField", () => {
  function Harness(props: {
    initial: number
    step?: number
    onChange?: (v: number) => void
    onCommit?: (v: number) => void
  }) {
    const [v, setV] = useState(props.initial)
    return (
      <SliderField
        label="Gain"
        value={v}
        min={0}
        max={1}
        step={props.step ?? 0.1}
        formatValue={(x) => x.toFixed(1)}
        onValueChange={(x) => {
          setV(x)
          props.onChange?.(x)
        }}
        onValueCommit={props.onCommit}
      />
    )
  }

  it("nudges by step and calls both change and commit", () => {
    const onChange = vi.fn()
    const onCommit = vi.fn()
    render(<Harness initial={0.2} onChange={onChange} onCommit={onCommit} />)
    fireEvent.click(screen.getByRole("button", { name: "Increase" }))
    expect(onChange).toHaveBeenLastCalledWith(0.3) // snapped, not 0.30000000000000004
    expect(onCommit).toHaveBeenLastCalledWith(0.3)
    fireEvent.click(screen.getByRole("button", { name: "Decrease" }))
    fireEvent.click(screen.getByRole("button", { name: "Decrease" }))
    expect(onCommit).toHaveBeenLastCalledWith(0.1)
    expect(screen.getByText("0.1")).toBeInTheDocument()
  })

  it("clamps at the ends and disables the button there", () => {
    const onCommit = vi.fn()
    render(<Harness initial={0.95} step={0.1} onCommit={onCommit} />)
    fireEvent.click(screen.getByRole("button", { name: "Increase" }))
    expect(onCommit).toHaveBeenLastCalledWith(1)
    expect(screen.getByRole("button", { name: "Increase" })).toBeDisabled()
  })
})

describe("SegmentedControl", () => {
  function Harness({ onChange }: { onChange: (v: string) => void }) {
    const [v, setV] = useState<"a" | "b" | "c">("a")
    return (
      <SegmentedControl
        aria-label="View"
        value={v}
        onValueChange={(x) => {
          setV(x)
          onChange(x)
        }}
        options={[
          { value: "a", label: "Tonight" },
          { value: "b", label: "Search" },
          { value: "c", label: "Manual" },
        ]}
      />
    )
  }

  it("selects one segment and never deselects", () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const search = screen.getByRole("radio", { name: "Search" })
    fireEvent.click(search)
    expect(onChange).toHaveBeenLastCalledWith("b")
    expect(search).toHaveAttribute("data-state", "on")
    expect(screen.getByRole("radio", { name: "Tonight" })).toHaveAttribute(
      "data-state",
      "off"
    )
    // Tapping the selected segment again keeps it selected.
    onChange.mockClear()
    fireEvent.click(search)
    expect(onChange).not.toHaveBeenCalled()
    expect(search).toHaveAttribute("data-state", "on")
  })
})

describe("ListRow", () => {
  it("renders body and action as sibling buttons, never nested", () => {
    const onPress = vi.fn()
    const onGo = vi.fn()
    const { container } = render(
      <List>
        <ListRow
          title="Orion Nebula"
          subtitle="M 42 · Nebula · mag 4.0"
          meta="54° SE"
          onPress={onPress}
          action={<Button onClick={onGo}>Go to</Button>}
        />
      </List>
    )
    expect(container.querySelector("button button")).toBeNull()
    expect(screen.getAllByRole("button")).toHaveLength(2)
    fireEvent.click(screen.getByRole("button", { name: "Go to" }))
    expect(onGo).toHaveBeenCalledOnce()
    expect(onPress).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: /Orion Nebula/ }))
    expect(onPress).toHaveBeenCalledOnce()
  })

  it("renders a non-interactive body without onPress", () => {
    render(
      <List>
        <ListRow title="Stellarium" />
      </List>
    )
    expect(screen.queryByRole("button")).toBeNull()
  })
})
