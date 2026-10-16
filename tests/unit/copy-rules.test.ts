import { describe, expect, it } from 'vitest';
import { findCopyViolations, stripTags } from '../../src/lib/copy-rules';

describe('copy rules [unit]', () => {
  it('passes plain, concrete prose', () => {
    expect(findCopyViolations('The agent refuses any question it cannot ground in the ledger.')).toEqual([]);
  });

  it('flags the ban-list words, case-insensitively and as whole words', () => {
    expect(findCopyViolations('We leveraged a seamless pipeline')).toEqual(['leveraged', 'seamless']);
    expect(findCopyViolations('Utilized by many')).toEqual(['utilized']);
    expect(findCopyViolations('An adjustment')).toEqual([]); // "just" inside a longer word is fine
    expect(findCopyViolations('It was just a test')).toEqual(['just']);
  });

  it('flags the em dash and the arrow glyph', () => {
    expect(findCopyViolations('problem — hard part → outcome')).toEqual(['—', '→']);
  });

  it('flags the terminology the PRD bans', () => {
    expect(findCopyViolations("After the timeskip, see the ship's log")).toEqual(['timeskip', "ship's log"]);
  });

  it('stripTags leaves only the readable text', () => {
    const html = '<style>.a{color:red}</style><p class="x">Hi <b>there</b></p><script>1</script>';
    expect(stripTags(html).replace(/\s+/g, ' ').trim()).toBe('Hi there');
  });
});
