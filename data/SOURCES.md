# Where the two schedule files come from

Both files are unmodified copies from public GitHub repositories.

| File here | Original | Source |
|---|---|---|
| `harbour-pointe.xer` | `xerfile/Harbour Pointe Assisted Living Center.xer` | https://github.com/djouallah/Xer-Reader-PowerBI (commit `7caebfb`) |
| `aspose-events-example.xer` | `testData/testXer.xer` | https://github.com/aspose-tasks-cloud/Aspose.Tasks-Cloud-SDK-for-Python (commit `3e8beae`, MIT) |

- **Harbour Pointe** is the assisted-living construction project that ships as a
  sample with Primavera P6 (export version 17.12, 131 activities, in progress).
  The source repository does not state a licence for the file.
- **Aspose events example** is a P6 8.3 export used as test data by the Aspose
  SDKs (83 activities, not started).

`test/fixtures/damaged.xer` is not a public schedule. It is generated from the
Aspose file by `scripts/make-damaged-fixture.ts`.
