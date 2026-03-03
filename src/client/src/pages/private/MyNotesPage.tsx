import React, { useState, useEffect } from 'react';
import { 
  Container, Typography, Box, Paper, Stack, CircularProgress, Button, IconButton 
} from '@mui/material';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { RootState } from '../../store/store';
import { setNewAlert } from '../../service/alert';
import { getMyNotes, deleteNote } from '../../service/notes';
import CustomPage from '../../components/layout/CustomPage';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';

const MyNotesPage: React.FC = () => {
  const { userId, token } = useSelector((state: RootState) => state.auth);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNotes = async () => {
      setLoading(true);
      const data = await getMyNotes(dispatch);
      if (data) {
        setNotes(data);
      }
      setLoading(false);
    };
    
    if (token) {
      fetchNotes();
    }
  }, [dispatch, token]);

  const handleDelete = async (noteId: string) => {
    if (window.confirm('Are you sure you want to delete this note?')) {
      const success = await deleteNote(dispatch, noteId);
      if (success) {
        setNotes((prevNotes) => prevNotes.filter((n) => n._id !== noteId));
      }
    }
  };

  const formatDate = (dateString: string) => {
    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  return (
    <CustomPage showNavigation={true} useBindingContainer={false}>
      <Box sx={{ backgroundColor: '#F9FAFB', minHeight: 'calc(100vh - 65px)', pt: { xs: 4, md: 6 }, pb: 8 }}>
        <Container maxWidth="md">
          
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
            <Typography variant="h4" sx={{ fontWeight: 800, color: '#111827' }}>
              My Notes
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => navigate('/notes/new')}
              sx={{ 
                backgroundColor: '#000', color: '#fff', px: 3, py: 1, 
                fontWeight: 600, borderRadius: '8px', textTransform: 'none',
                boxShadow: 'none', '&:hover': { backgroundColor: '#333', boxShadow: 'none' }
              }}
            >
              New Note
            </Button>
          </Box>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
              <CircularProgress size={40} sx={{ color: '#000' }} />
            </Box>
          ) : notes.length === 0 ? (
            <Paper elevation={0} sx={{ p: 6, textAlign: 'center', borderRadius: '16px', border: '1px dashed #E5E7EB', backgroundColor: 'transparent' }}>
              <Typography variant="h6" sx={{ color: '#6B7280', fontWeight: 500 }}>No notes yet.</Typography>
              <Typography variant="body2" sx={{ color: '#9CA3AF', mt: 1 }}>Start documenting what you learn!</Typography>
            </Paper>
          ) : (
            <Stack spacing={3}>
              {notes.map((note) => (
                <Paper key={note._id} elevation={0} sx={{ 
                  p: { xs: 3, md: 4 }, 
                  borderRadius: '16px',
                  border: '1px solid #E5E7EB',
                  backgroundColor: '#ffffff'
                }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 700, color: '#111827', mb: 1 }}>
                        {note.subject}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#9CA3AF', display: 'block', mb: 2 }}>
                        {formatDate(note.createdAt || new Date().toISOString())}
                      </Typography>
                    </Box>
                    <Box>
                      <IconButton onClick={() => navigate(`/notes/${note._id}/edit`)} size="small" sx={{ color: '#6B7280', mr: 1 }}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton onClick={() => handleDelete(note._id)} size="small" sx={{ color: '#EF4444' }}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </Box>
                  <Typography variant="body1" sx={{ color: '#4B5563', lineHeight: 1.6 }}>
                    {note.content}
                  </Typography>
                </Paper>
              ))}
            </Stack>
          )}

        </Container>
      </Box>
    </CustomPage>
  );
};

export default MyNotesPage;