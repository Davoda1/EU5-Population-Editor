Edits are proposed as drafts and become part of your project only when you choose Apply. This gives you an explicit chance to check exact values and totals.

## Choose an operation

| Operation | Purpose |
| --- | --- |
| Exact demographic tuple | Change one population group's size |
| Scale population total | Change a location's total while distributing its population |
| Add population group | Add a group using known type, culture and religion identifiers |
| Remove population group | Remove the selected group |
| Rebalance proportions | Redistribute a demographic axis while preserving the total |

A demographic tuple identifies a population group by type, culture and religion. Additional source fields are handled conservatively; invalid or ambiguous data is reported.

## Population units

Population sizes and totals in the interface are counts of **people**. One source size unit in an EU5 population file represents `1,000` people: source `0.001` means `1` person, and source `1.25` means `1,250` people. Projects and exported EU5 files retain the game's source units; the interface performs the exact conversion.

Enter whole numbers for an exact size, a target total, an absolute change or a new group's size. Do not add thousands separators to an input. Percentage changes, multiplication factors and ratio weights can use decimals. New population allocations use one-person steps, while total-preserving operations keep the chosen total exact.

Older projects or game data can contain a fraction of a person at their recorded precision. Opening, displaying, saving or exporting that data preserves it. The interface shows the fractional value accurately. If a total-preserving operation requires a whole-person total, explicitly use **Set exact value / target** to choose that total first and review the change. No implicit conversion rewrites existing data.

## Calculations

| Calculation | Example input | Effect |
| --- | --- | --- |
| Set exact value / target | `120000` | Set the selected size or total to 120,000 people |
| Add / subtract absolute value | `-5000` | Subtract 5,000 people |
| Increase / decrease percent | `10` | Increase by 10 percent |
| Multiply by factor | `1.25` | Multiply by 1.25 |

Use a decimal point for rates and weights. Negative changes must not result in invalid negative population sizes. The editor validates the proposal before it can be applied. Percentage and multiplication calculations round the resulting nonnegative target to the nearest person, with an exact half-person rounded upward. Distribution across groups uses deterministic largest-remainder allocation so the displayed target and allocated total agree. Review the resulting rows before applying.

## Review, Apply and Discard

**Review draft** calculates a proposal. Compare the Original, Working and Draft totals and the change from Working. **Apply** confirms the current reviewed proposal. **Discard** removes the pending form and proposal.

If you edit an input after reviewing, the proposal is no longer current. Review again before applying. Save and export continue to use only Working values, even while a draft is visible.

## Add or remove groups

For an added group, choose one population type, culture and religion from the definitions loaded with the selected game installation. This creates that exact combination with the size you enter; it does not distribute the size across other combinations. Arbitrary new identifiers cannot be created here. If the combination already exists, use its **Edit** button instead. Specify a valid size and review the result.

When **Rebalance ratios** introduces a demographic group, it uses the location's positive population profile. If that group's rows were retained at zero, a positive share is divided evenly across those rows instead; their identities and additional fields are kept, but zero values cannot recover previous proportions. This is the rebalance operation's [Default preservation](ratios.html#default-preservation) behavior. If the whole location is empty, add a positive population group before asking the editor to redistribute it.

Removing a group can change the location total. If your intention is to redistribute its share while preserving the total, use [Rebalance proportions](ratios.html) instead.

## Undo and redo

Undo and redo operate on confirmed actions. Resolve pending drafts first by applying or discarding them. A game-data migration establishes a new source boundary and clears the previous undo history. Save a separate project copy before undertaking a major migration.
