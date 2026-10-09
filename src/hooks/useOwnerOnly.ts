import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMyGarageMembership } from '../lib/data';

// Garage pages only the owner may use (settings, price list, team). An
// employee who lands here (old link, back button) is sent to their own area.
// The database enforces the same rules; this just avoids a broken-looking page.
export function useOwnerOnly(redirectTo = '/garage') {
    const navigate = useNavigate();
    useEffect(() => {
        getMyGarageMembership().then((m) => {
            if (m && m.memberRole === 'staff') navigate(redirectTo, { replace: true });
        }).catch(() => {});
    }, [navigate, redirectTo]);
}
