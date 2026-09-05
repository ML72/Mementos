import { v4 as uuidv4 } from 'uuid';
import { addAlert, removeAlert } from '../store/slices/ui';
import { isTokenInvalidError } from './interceptors';

export const setNewAlert = (
    dispatch: any,
    { msg, alertType = 'success', timeout = 5000 }: { msg: string, alertType?: string, timeout?: number }
) => {

    const id = uuidv4();
    dispatch(addAlert({
        msg, alertType, id
    }));

    setTimeout(() => {
        dispatch(removeAlert({ id }));
    }, timeout);
}

// Surface an axios error as alert(s). The API returns errors as { errors: [{ msg }] };
// raise one alert per validation message, falling back to a generic message.
export const setApiErrorAlert = (dispatch: any, err: any, fallbackMsg: string) => {
    // A dead token is already reported and acted on by the axios response interceptor
    // (sign-out plus a "your login has expired" alert), so don't stack the raw API message
    // ("Token is not valid") on top of it.
    if (isTokenInvalidError(err)) {
        return;
    }

    // Handle general API errors
    const errors = err?.response?.data?.errors;
    if (Array.isArray(errors) && errors.length > 0) {
        errors.forEach((e: any) => setNewAlert(dispatch, { msg: e.msg || e, alertType: 'error' }));
    } else {
        setNewAlert(dispatch, { msg: err?.response?.data?.msg || fallbackMsg, alertType: 'error' });
    }
};