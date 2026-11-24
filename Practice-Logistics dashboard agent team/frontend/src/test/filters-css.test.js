// @vitest-environment node
// Reads the stylesheet as text: jsdom does not compute layout, so the
// shared height and font rules are checked against the source CSS.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const css = readFileSync(fileURLToPath(new URL('../index.css', import.meta.url)), 'utf8')

// Returns the declaration block for an exact selector list, e.g. ".filters select, ...".
// Anchored to the start of a rule so a longer selector list that ends in the same
// text is not matched by mistake.
function blockFor(selectorList) {
  const escaped = selectorList.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`(?:^|\\}|\\n)\\s*${escaped} \\{([^}]*)\\}`).exec(css)
  return match ? match[1] : null
}

describe('filter controls share one size and font', () => {
  const shared = blockFor('.filters select, .filters input[type="search"]')

  it('defines a shared rule for the Status/Carrier selects and the Search input', () => {
    expect(shared).not.toBeNull()
  })

  it('gives both controls the same fixed height', () => {
    expect(shared).toMatch(/height:\s*36px/)
  })

  it('gives both controls the same font family and size', () => {
    expect(shared).toMatch(/font-family:\s*inherit/)
    expect(shared).toMatch(/font-size:\s*\.9rem/)
  })

  it('uses border-box sizing and a fixed line-height so the box is predictable', () => {
    expect(shared).toMatch(/box-sizing:\s*border-box/)
    expect(shared).toMatch(/line-height:\s*1\.2/)
  })

  it('removes native search appearance so the browser default height does not apply', () => {
    const searchBlock = blockFor('.filters input[type="search"]')
    expect(searchBlock).toMatch(/appearance:\s*none/)
  })
})
