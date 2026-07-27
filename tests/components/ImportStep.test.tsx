import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import type { ImportSource, ImportedFilm } from '@subplot/domain/imports';
import ImportStep from '../../src/components/ImportStep';

const setup = () => {
  const onImported = vi.fn<(source: ImportSource, films: ImportedFilm[]) => void>();
  render(<ImportStep onImported={onImported} />);
  const textarea = screen.getByLabelText(/paste a watchlist/i) as HTMLTextAreaElement;
  const button = screen.getByRole('button', { name: /find my titles/i });
  return { onImported, textarea, button };
};

describe('ImportStep — paste path', () => {
  it('disables the paste button until there is a non-empty line', () => {
    const { button, textarea } = setup();
    expect(button).toBeDisabled();
    fireEvent.change(textarea, { target: { value: '\n   \n' } });
    expect(button).toBeDisabled();
    fireEvent.change(textarea, { target: { value: 'Parasite' } });
    expect(button).toBeEnabled();
  });

  it('parses a pasted free-text list and calls onImported with plaintext titles', () => {
    const { onImported, textarea, button } = setup();
    fireEvent.change(textarea, {
      target: { value: '- Parasite\n[ ] The Bear\nTo watch:\nDune (2021)' },
    });
    fireEvent.click(button);

    expect(onImported).toHaveBeenCalledTimes(1);
    const [source, films] = onImported.mock.calls[0];
    expect(source).toBe('plaintext');
    expect(films.map((f) => f.title)).toEqual(['Parasite', 'The Bear', 'Dune']);
    expect(films.find((f) => f.title === 'Dune')?.year).toBe('2021');
    // No media-type signal from free text — resolution discovers it downstream.
    expect(films.every((f) => f.mediaType === undefined)).toBe(true);
  });

  it('routes a pasted CSV export through the CSV parser, not the list parser', () => {
    const { onImported, textarea, button } = setup();
    fireEvent.change(textarea, {
      target: {
        value:
          'Date,Name,Year,Letterboxd URI\n2024-01-05,Parasite,2019,https://boxd.it/hTha',
      },
    });
    fireEvent.click(button);
    expect(onImported).toHaveBeenCalledWith('letterboxd', expect.any(Array));
  });

  it('shows an error when the pasted text yields no titles', () => {
    const { onImported, textarea, button } = setup();
    fireEvent.change(textarea, { target: { value: 'Movies to watch:' } });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onImported).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn.?t find any titles/i);
  });
});
