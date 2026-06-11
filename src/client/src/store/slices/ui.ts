import { createSlice } from '@reduxjs/toolkit';

const initialState: any = {
    alerts: []
};

export const uiSlice = createSlice({
    name: 'ui',
    initialState,
    reducers: {
        addAlert: (state, action) => {
            const { msg, alertType, id } = action.payload;
            state.alerts.push({ msg, alertType, id });
        },
        removeAlert: (state, action) => {
            const { id } = action.payload;
            state.alerts = state.alerts.filter((alert: any) => alert.id !== id);
        }
    }
});

export const { addAlert, removeAlert } = uiSlice.actions;

export const selectAlertState = (state: any) => state.ui.alerts;

export default uiSlice.reducer;