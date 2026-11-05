import React, { useState, useEffect } from 'react';
import { 
  Container, Typography, Box, Paper, TextField, Button, Stack, Divider, CircularProgress,
  Tabs, Tab
} from '@mui/material';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import { RootState } from '../../store/store';
import { setNewAlert } from '../../service/alert';
import { createNote, updateNote, getNoteById } from '../../service/notes';
import CustomPage from '../../components/layout/CustomPage';
import TagInput from '../../components/layout/TagInput';
import MarkdownViewer from '../../components/layout/MarkdownViewer';
import SaveIcon from '@mui/icons-material/Save';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

const NoteEditorPage: React.FC = () => {
  const { noteId } = useParams<{ noteId: string }>();
  const isEditing = Boolean(noteId && noteId !== 'new');
  
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { token } = useSelector((state: RootState) => state.auth);

  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(isEditing);
  const [tabIndex, setTabIndex] = useState(0);

  useEffect(() => {
    if (isEditing && noteId && token) {
      const fetchNote = async () => {
        setLoading(true);
        const note = await getNoteById(dispatch, noteId);
        if (note) {
          setSubject(note.subject);
          setContent(note.content);
          setTags(note.tags || []);
        }
        setLoading(false);
      };
      fetchNote();
    }
  }, [isEditing, noteId, dispatch, token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject || !content) {
      setNewAlert(dispatch, { msg: 'Subject and content are required', alertType: 'error' });
      return;
    }
    
    setSubmitting(true);
    const noteData = { subject, content, tags };
    
    try {
      if (isEditing && noteId) {
        const res = await updateNote(dispatch, noteId, noteData);
        if (res) navigate('/notes');
      } else {
        const res = await createNote(dispatch, noteData);
        if (res) navigate('/notes');
      }
    } catch {
      setNewAlert(dispatch, { msg: 'Failed to save note', alertType: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <CustomPage title={isEditing ? 'Edit Note' : 'New Note'} showNavigation={true} useBindingContainer={false}>
      <Box sx={{ backgroundColor: '#F9FAFB', minHeight: 'calc(100vh - 65px)', pt: { xs: 4, md: 6 }, pb: 8 }}>
        <Container maxWidth="md">
          
          <Button 
            startIcon={<ArrowBackIcon />} 
            onClick={() => navigate(-1)}
            sx={{ mb: 3, color: '#6B7280', textTransform: 'none', fontWeight: 600 }}
          >
            Back
          </Button>

          <Paper elevation={0} sx={{ 
            p: { xs: 3, md: 5 }, 
            borderRadius: '16px',
            border: '1px solid #E5E7EB',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
            backgroundColor: '#ffffff'
          }}>
            <Typography variant="h4" sx={{ fontWeight: 800, color: '#111827', mb: 4 }}>
              {isEditing ? 'Edit Note' : 'Create New Note'}
            </Typography>

            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                <CircularProgress size={40} sx={{ color: '#000' }} />
              </Box>
            ) : (
              <Box component="form" onSubmit={handleSubmit}>
                <Stack spacing={3}>
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#4B5563', mb: 1 }}>Subject</Typography>
                    <TextField
                      fullWidth
                      placeholder="E.g., The architecture of React Fiber"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      variant="outlined"
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                    />
                  </Box>
                
                <Box>
                  <Box sx={{ mb: 3 }}>
                    <Tabs 
                      value={tabIndex} 
                      onChange={(e, newValue) => setTabIndex(newValue)}
                      TabIndicatorProps={{ sx: { backgroundColor: '#000', height: 3 } }}
                      sx={{
                        borderBottom: 1,
                        borderColor: 'divider',
                        minHeight: 48,
                        '& .MuiTab-root': {
                          textTransform: 'none',
                          fontWeight: 600,
                          fontSize: '1rem',
                          color: '#6B7280',
                          '&.Mui-selected': {
                            color: '#111827'
                          }
                        }
                      }}
                    >
                      <Tab label="Write" />
                      <Tab label="Preview" />
                    </Tabs>
                  </Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#4B5563', mb: 1 }}>Content</Typography>
                  {tabIndex === 0 ? (
                    <TextField
                      fullWidth
                      multiline
                      minRows={8}
                      placeholder="Write your note down in detail... (Markdown and LaTeX supported)"
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      variant="outlined"
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                    />
                  ) : (
                    <Box sx={{ 
                      minHeight: '200px', 
                      p: 2, 
                      border: '1px solid #E5E7EB', 
                      borderRadius: '8px',
                      backgroundColor: '#FAFAFA'
                    }}>
                      {content.trim() ? (
                        <MarkdownViewer content={content} />
                      ) : (
                        <Typography variant="body2" sx={{ color: '#9CA3AF', fontStyle: 'italic' }}>
                          Preview will appear here...
                        </Typography>
                      )}
                    </Box>
                  )}
                </Box>
                
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#4B5563', mb: 1 }}>Tags</Typography>
                  <TagInput
                    tags={tags}
                    setTags={setTags}
                    placeholder="E.g., React, Frontend (press Enter to add)"
                  />
                </Box>

                <Divider sx={{ my: 2 }} />

                <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
                  <Button
                    variant="outlined"
                    onClick={() => navigate(-1)}
                    sx={{ 
                      px: 3, py: 1.5, fontWeight: 600, color: '#4B5563', borderColor: '#D1D5DB', borderRadius: '8px', textTransform: 'none',
                      '&:hover': { backgroundColor: '#F3F4F6', borderColor: '#9CA3AF' }
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={submitting}
                    startIcon={<SaveIcon />}
                    sx={{ 
                      px: 4, py: 1.5, fontWeight: 600, backgroundColor: '#000', color: '#fff', borderRadius: '8px', textTransform: 'none',
                      boxShadow: 'none', '&:hover': { backgroundColor: '#333', boxShadow: 'none' }
                    }}
                  >
                    {isEditing ? 'Save Changes' : 'Create Note'}
                  </Button>
                </Box>
              </Stack>
            </Box>
            )}
          </Paper>

        </Container>
      </Box>
    </CustomPage>
  );
};

export default NoteEditorPage;