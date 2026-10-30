import React, { useId, useState } from 'react';
import { Box, TextField, Chip, Typography } from '@mui/material';

// Mirrors CONTENT_LIMITS.NOTE in src/server/settings.ts; the API enforces the same limits and
// explains any it rejects.
export const MAX_TAGS = 10;
export const TAG_MAX_LENGTH = 30;

interface TagInputProps {
  tags: string[];
  setTags: (tags: string[]) => void;
  placeholder?: string;
}

const TagInput: React.FC<TagInputProps> = ({ tags, setTags, placeholder = 'Add a tag and press Enter...' }) => {
  const [inputValue, setInputValue] = useState('');
  const messageId = useId();

  // What stops the tag being typed from being added, said while it is typed rather than on save.
  // Length is counted as the API counts it (String#length).
  const pendingTag = inputValue.trim();
  const problem =
    pendingTag.length > TAG_MAX_LENGTH
      ? `Tags can be up to ${TAG_MAX_LENGTH} characters. This one is ${pendingTag.length}.`
      : pendingTag && tags.length >= MAX_TAGS
        ? `A note can have up to ${MAX_TAGS} tags. Remove one to add another.`
        : '';

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      // Keep a tag that can't be added in the box, so it can be shortened instead of retyped.
      if (problem) return;
      if (pendingTag && !tags.includes(pendingTag)) {
        setTags([...tags, pendingTag]);
      }
      setInputValue('');
    } else if (e.key === 'Backspace' && inputValue === '' && tags.length > 0) {
      setTags(tags.slice(0, -1));
    }
  };

  const handleDelete = (tagToDelete: string) => {
    setTags(tags.filter((tag) => tag !== tagToDelete));
  };

  const borderColor = problem ? '#d32f2f' : '#000';

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 1,
          border: '1px solid',
          borderColor: problem ? '#d32f2f' : '#c4c4c4',
          borderRadius: '8px',
          p: 1,
          minHeight: '56px',
          '&:hover': {
            borderColor,
          },
          '&:focus-within': {
            borderColor,
            borderWidth: '2px',
            p: '7px'
          }
        }}
      >
        {tags.map((tag, index) => (
          <Chip
            key={index}
            label={tag}
            onDelete={() => handleDelete(tag)}
            sx={{
              borderRadius: '6px',
              backgroundColor: '#F3F4F6',
              color: '#4B5563',
              fontWeight: 500,
            }}
          />
        ))}
        <TextField
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? placeholder : ''}
          variant="standard"
          slotProps={{
            input: {
              disableUnderline: true,
              sx: { fontSize: '0.9rem', color: '#111827' },
            },
            htmlInput: {
              'aria-label': 'Add a tag',
              'aria-invalid': Boolean(problem),
              'aria-describedby': problem ? messageId : undefined,
            },
          }}
          sx={{
            flexGrow: 1,
            minWidth: '150px',
          }}
        />
      </Box>
      {problem && (
        <Typography id={messageId} role="alert" variant="caption" sx={{ display: 'block', color: '#d32f2f', mt: 0.75, ml: 0.5 }}>
          {problem}
        </Typography>
      )}
    </Box>
  );
};

export default TagInput;
