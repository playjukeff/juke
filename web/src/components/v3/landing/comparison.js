/* The comparison slot on the landing page (workstream B4). EMPTY until the
   owner writes it, and the section does not render while it is.

   Rules for every row, because a comparison table is the easiest place on
   a marketing page to say something untrue:
   - each cell is a fact somebody can check, not a judgement of quality;
   - `source` links to where it can be checked;
   - `asOf` dates the whole table, because other tools change;
   - it is framed as what Juke does differently, never as what another tool
     does badly.

   Shape:
   export const COMPARISON = {
     asOf: '17 September 2026',
     columns: ['Juke', 'Tool A', 'Tool B'],
     rows: [
       { label: 'Mock draft without an account', cells: ['Yes', '…', '…'], source: 'https://…' },
     ],
   }

   Preview the layout, with placeholder cells, at #/welcome?compare=preview. */
export const COMPARISON = { asOf: null, columns: [], rows: [] }
