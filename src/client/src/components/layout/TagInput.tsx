import React, { useState } from 'react';
import { Box, TextField, Chip, Stack } from '@mui/material';

interface TagInputProps {
  tags: string[];
  setTags: (tags: string[]) => void;
  placeholder?: string;
}

const TagInput: React.FC<TagInputProps> = ({ tags, setTags, placeholder = 'Add a tag and press Enter...' }) => {
  const [inputValue, setInputValue] = useState('');

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const newTag = inputValue.trim();
      if (newTag && !tags.includes(newTag)) {
        setTags([...tags, newTag]);
      }
      setInputValue('');
    } else if (e.key === 'Backspace' && inputValue === '' && tags.length > 0) {
      setTags(tags.slice(0, -1));
    }
  };

  const handleDelete = (tagToDelete: string) => {
    setTags(tags.filter((tag) => tag !== tagToDelete));
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 1,
        border: '1px solid #c4c4c4',
        borderRadius: '8px',
        p: 1,
        minHeight: '56px',
        '&:hover': {
          borderColor: '#000',
        },
        '&:focus-within': {
          borderColor: '#000',
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
        InputProps={{
          disableUnderline: true,
          sx: { fontSize: '0.9rem', color: '#111827' },
        }}
        sx={{
          flexGrow: 1,
          minWidth: '150px',
        }}
      />
    </Box>
  );
};

export default TagInput;
