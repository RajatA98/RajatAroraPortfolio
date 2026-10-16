Fixtures for tests/unit/ip-scan.test.ts.

The default ip-scan run skips this whole folder because some files here
intentionally contain denylisted terms. Tests point the scanner at these
folders explicitly.

clean/       a tree with near-miss words that must NOT match (exit 0)
dirty-body/  a tree with a planted franchise phrase in a file body
planted.json term strings the tests use to build throwaway trees in a temp dir
