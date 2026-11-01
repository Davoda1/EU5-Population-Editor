Use Rebalance proportions to change demographic shares without changing the location's total. Use Scale Population separately when the total itself should change.

## Enter weights

Choose **Rebalance ratios**, then select the culture, religion or population-type axis. Enter one known identifier and weight on each line:

```text
identifier_one = 7
identifier_two = 3
```

These identifiers are placeholders, not game identifiers. Replace them with names present in your loaded definitions. Weights of 7 and 3 request shares of 70 percent and 30 percent; the editor normalizes them. Weights of 70 and 30 express the same proportions.

> Omitted groups receive zero on the selected axis. Include every group you intend to retain.

Repeated identifiers, malformed lines and unknown definitions are rejected. The normalized shares are shown before review. Use **Review draft** to inspect the actual population rows and exact total.

## Default preservation

The default mode preserves each existing group's internal demographic structure where possible. A newly introduced group uses the location's profile. For example, changing culture shares does not require you to manually recreate every religion and population-type combination.

If a retained group's rows are all zero, those rows no longer encode their earlier proportions. Restoring a positive share divides people evenly across the retained rows, using deterministic one-person remainder allocation; their demographic identities and additional fields are preserved. This does not restore historical ratios that were lost when the sizes became zero.

## Advanced preservation

Expand **Advanced preservation** to preserve each complementary demographic bucket independently. If culture is the edited axis, the complementary buckets are combinations of religion and population type.

This option redistributes the chosen axis inside each bucket. Allocation in whole-person steps can produce small differences from the requested overall percentages while each preserved total remains exact. Compare the resulting rows before applying.

Legacy data with a fractional-person location total cannot be rebalanced into whole people while preserving that same total. Advanced preservation also requires whole-person totals for every preserved bucket. The editor reports these cases. Choose an explicit whole-person target with **Scale Population → Set exact value / target**, review the resulting distribution, and then retry the rebalance. It does not silently round the old totals.

## Change the total separately

Choose **Scale Population** for an exact target, absolute change, percentage change or multiplier. For example, a multiplier of `1.1` requests a ten-percent increase in total population. Review the proposed total and distribution, then apply it.

The application uses exact arithmetic and deterministic allocation, with population shown in people. For example, a `10000` target means 10,000 people and is stored as source size `10` in the game file. Existing project and game-file values retain their exact source-unit representation. See [Population units](editing.html#population-units) for the treatment of legacy fractions.
