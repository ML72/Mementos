import React, { useState, useEffect, useMemo } from 'react';
import {
  Container, Typography, Box, Paper, Stack, CircularProgress, Button, IconButton,
  MenuItem, Select, FormControl, InputLabel, Checkbox, ListItemText, OutlinedInput,
  Chip, Tabs, Tab, Avatar
} from '@mui/material';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { RootState } from '../../store/store';
import { getMyNotes, deleteNote } from '../../service/notes';
import CustomPage from '../../components/layout/CustomPage';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandableText from '../../components/layout/ExpandableText';
import LikeButton from '../../components/layout/LikeButton';
import { useNoteLikes } from '../../hooks/useNoteLikes';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';

const ITEM_HEIGHT = 48;
const ITEM_PADDING_TOP = 8;
const MenuProps = {
  PaperProps: {
    style: {
      maxHeight: ITEM_HEIGHT * 4.5 + ITEM_PADDING_TOP,
      width: 250,
      borderRadius: '8px'
    },
  },
};

const MyNotesPage: React.FC = () => {
  const { token } = useSelector((state: RootState) => state.auth);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { likedNotes, loadingLiked, isLiked, likeCountFor, toggleLike } = useNoteLikes();

  const [activeTab, setActiveTab] = useState(0); // 0: My Notes, 1: Liked Notes
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtering & Sorting State (My Notes tab only)
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortField, setSortField] = useState<'dateCreated' | 'dateUpdated' | 'alphabetical'>('dateCreated');
  const [sortAscending, setSortAscending] = useState<boolean>(false);

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

  const getInitial = (name?: string | null) => (name ? name.charAt(0).toUpperCase() : '?');
  const displayName = (user?: any) =>
    user?.profile?.fullName || user?.fullName || user?.login?.email || 'Unknown User';

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    notes.forEach(note => {
      if (note.tags && Array.isArray(note.tags)) {
        note.tags.forEach((tag: string) => tagSet.add(tag));
      }
    });
    return Array.from(tagSet).sort();
  }, [notes]);

  const handleTagChange = (event: any) => {
    const {
      target: { value },
    } = event;
    setSelectedTags(typeof value === 'string' ? value.split(',') : value);
  };

  const filteredAndSortedNotes = useMemo(() => {
    let result = [...notes];

    // Filter by tags
    if (selectedTags.length > 0) {
      result = result.filter(note =>
        note.tags && note.tags.some((tag: string) => selectedTags.includes(tag))
      );
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'alphabetical') {
        comparison = (a.subject || '').localeCompare(b.subject || '');
      } else if (sortField === 'dateCreated') {
        const dateA = new Date(a.dateCreated || a.createdAt || 0).getTime();
        const dateB = new Date(b.dateCreated || b.createdAt || 0).getTime();
        comparison = dateA - dateB;
      } else if (sortField === 'dateUpdated') {
        const dateA = new Date(a.lastUpdated || a.dateUpdated || a.updatedAt || a.dateCreated || a.createdAt || 0).getTime();
        const dateB = new Date(b.lastUpdated || b.dateUpdated || b.updatedAt || b.dateCreated || b.createdAt || 0).getTime();
        comparison = dateA - dateB;
      }
      return sortAscending ? comparison : -comparison;
    });

    return result;
  }, [notes, selectedTags, sortField, sortAscending]);

  const loadingBox = (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
      <CircularProgress size={40} sx={{ color: '#000' }} />
    </Box>
  );

  const emptyState = (title: string, subtitle?: string) => (
    <Paper elevation={0} sx={{ p: 6, textAlign: 'center', borderRadius: '16px', border: '1px dashed #E5E7EB', backgroundColor: 'transparent' }}>
      <Typography variant="h6" sx={{ color: '#6B7280', fontWeight: 500 }}>{title}</Typography>
      {subtitle && <Typography variant="body2" sx={{ color: '#9CA3AF', mt: 1 }}>{subtitle}</Typography>}
    </Paper>
  );

  const tagChips = (note: any) => (
    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ flex: 1 }}>
      {note.tags && note.tags.map((tag: string, idx: number) => (
        <Chip
          key={idx}
          label={tag}
          size="small"
          sx={{ backgroundColor: '#F3F4F6', color: '#4B5563', fontWeight: 500, borderRadius: '6px' }}
        />
      ))}
    </Stack>
  );

  // A note authored by the current user: editable/deletable, with a read-only like count.
  const renderMyNote = (note: any) => (
    <Paper key={note._id} elevation={0} sx={{ p: { xs: 3, md: 4 }, borderRadius: '16px', border: '1px solid #E5E7EB', backgroundColor: '#ffffff' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700, color: '#111827', mb: 1 }}>
            {note.subject}
          </Typography>
          <Typography variant="caption" sx={{ color: '#9CA3AF', display: 'block' }}>
            {formatDate(note.dateCreated || note.createdAt || new Date().toISOString())}
          </Typography>
        </Box>
        <Box sx={{ flexShrink: 0 }}>
          <IconButton onClick={() => navigate(`/notes/${note._id}/edit`)} size="small" sx={{ color: '#6B7280', mr: 1 }}>
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton onClick={() => handleDelete(note._id)} size="small" sx={{ color: '#EF4444' }}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>
      <ExpandableText text={note.content} maxLength={250} />
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, mt: 2 }}>
        {tagChips(note)}
        <LikeButton liked={isLiked(note._id)} count={likeCountFor(note)} readOnly />
      </Box>
    </Paper>
  );

  // A note the current user has liked (authored by someone else): shows author + a toggle.
  const renderLikedNote = (note: any) => (
    <Paper key={note._id} elevation={0} sx={{ p: { xs: 3, md: 4 }, borderRadius: '16px', border: '1px solid #E5E7EB', backgroundColor: '#ffffff' }}>
      <Box
        sx={{ display: 'flex', alignItems: 'center', mb: 2, width: 'fit-content', cursor: note.creator?._id ? 'pointer' : 'default' }}
        onClick={() => { if (note.creator?._id) navigate(`/profile/${note.creator._id}`); }}
      >
        <Avatar sx={{ width: 32, height: 32, bgcolor: '#F3F4F6', color: '#4B5563', mr: 1.5, fontSize: '0.85rem', fontWeight: 600 }}>
          {getInitial(displayName(note.creator))}
        </Avatar>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#111827' }}>
          {displayName(note.creator)}
        </Typography>
      </Box>
      <Typography variant="h6" sx={{ fontWeight: 700, color: '#111827', mb: 1 }}>
        {note.subject}
      </Typography>
      <ExpandableText text={note.content} maxLength={250} />
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, mt: 2 }}>
        {tagChips(note)}
        <LikeButton liked={isLiked(note._id)} count={likeCountFor(note)} onToggle={() => toggleLike(note)} />
      </Box>
    </Paper>
  );

  return (
    <CustomPage title="Notes" showNavigation={true} useBindingContainer={false}>
      <Box sx={{ backgroundColor: '#F9FAFB', minHeight: 'calc(100vh - 65px)', pt: { xs: 4, md: 6 }, pb: 8 }}>
        <Container maxWidth="md">

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, gap: 2 }}>
            <Typography variant="h4" sx={{ fontWeight: 800, color: '#111827' }}>
              Notes
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

          <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 4 }}>
            <Tabs
              value={activeTab}
              onChange={(_, v) => setActiveTab(v)}
              TabIndicatorProps={{ style: { backgroundColor: '#000', height: 3 } }}
              sx={{ '& .MuiTab-root': { textTransform: 'none', fontWeight: 600, fontSize: '1rem', color: '#6B7280' }, '& .Mui-selected': { color: '#111827 !important' } }}
            >
              <Tab label="My Notes" />
              <Tab label="Liked Notes" />
            </Tabs>
          </Box>

          {activeTab === 0 ? (
            <>
              {!loading && notes.length > 0 && (
                <Paper elevation={0} sx={{
                  p: 2, mb: 4, borderRadius: '12px', border: '1px solid #E5E7EB',
                  backgroundColor: '#fff', display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center'
                }}>
                  <FormControl sx={{ minWidth: 200 }} size="small">
                    <InputLabel id="tag-filter-label" sx={{ color: '#4B5563', '&.Mui-focused': { color: '#000' } }}>Filter by Tags</InputLabel>
                    <Select
                      labelId="tag-filter-label"
                      multiple
                      value={selectedTags}
                      onChange={handleTagChange}
                      input={<OutlinedInput label="Filter by Tags" sx={{ borderRadius: '8px', '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#000' } }} />}
                      renderValue={(selected) => selected.join(', ')}
                      MenuProps={MenuProps}
                    >
                      {allTags.map((tag) => (
                        <MenuItem key={tag} value={tag}>
                          <Checkbox checked={selectedTags.indexOf(tag) > -1} sx={{ color: '#6B7280', '&.Mui-checked': { color: '#000' } }} />
                          <ListItemText primary={tag} />
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <FormControl sx={{ minWidth: 200 }} size="small">
                    <InputLabel id="sort-field-label" sx={{ color: '#4B5563', '&.Mui-focused': { color: '#000' } }}>Sort by</InputLabel>
                    <Select
                      labelId="sort-field-label"
                      value={sortField}
                      onChange={(e) => setSortField(e.target.value as any)}
                      input={<OutlinedInput label="Sort by" sx={{ borderRadius: '8px', '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#000' } }} />}
                    >
                      <MenuItem value="dateCreated">Date Created</MenuItem>
                      <MenuItem value="dateUpdated">Date Updated</MenuItem>
                      <MenuItem value="alphabetical">Alphabetical</MenuItem>
                    </Select>
                  </FormControl>

                  <IconButton
                    onClick={() => setSortAscending(!sortAscending)}
                    sx={{
                      border: '1px solid #E5E7EB', borderRadius: '8px',
                      color: '#4B5563', '&:hover': { backgroundColor: '#F9FAFB' }
                    }}
                  >
                    {sortAscending ? <ArrowUpwardIcon /> : <ArrowDownwardIcon />}
                  </IconButton>
                </Paper>
              )}

              {loading ? (
                loadingBox
              ) : notes.length === 0 ? (
                emptyState('No notes yet.', 'Start documenting what you learn!')
              ) : filteredAndSortedNotes.length === 0 ? (
                emptyState('No notes matches your criteria.')
              ) : (
                <Stack spacing={3}>
                  {filteredAndSortedNotes.map(renderMyNote)}
                </Stack>
              )}
            </>
          ) : (
            <>
              {loadingLiked ? (
                loadingBox
              ) : likedNotes.length === 0 ? (
                emptyState('No liked notes yet.', "Like notes from your feed or other people's profiles to save them here.")
              ) : (
                <Stack spacing={3}>
                  {likedNotes.map(renderLikedNote)}
                </Stack>
              )}
            </>
          )}

        </Container>
      </Box>
    </CustomPage>
  );
};

export default MyNotesPage;
