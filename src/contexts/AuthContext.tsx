import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { signOut } from '../lib/auth';
import { getMyRoles, type AppRole } from '../lib/data';

interface UserData {
    _id: string;
    firebaseUid: string;
    phoneNumber: string;
    role: AppRole; // the ACTIVE role (which dashboard the user is in)
}

interface AuthContextType {
    user: User | null;
    userData: UserData | null;
    availableRoles: AppRole[]; // every role this number holds
    loading: boolean;
    isAuthenticated: boolean;
    setUserData: (data: UserData | null) => void;
    setUser: (user: User | null) => void;
    switchRole: (role: AppRole) => void;
    refreshRoles: () => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    userData: null,
    availableRoles: [],
    loading: true,
    isAuthenticated: false,
    setUserData: () => { },
    setUser: () => { },
    switchRole: () => { },
    refreshRoles: async () => { },
    logout: async () => { },
});

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [userData, setUserData] = useState<UserData | null>(null);
    const [availableRoles, setAvailableRoles] = useState<AppRole[]>([]);
    const [loading, setLoading] = useState(true);

    // Links the signed-in auth user to its profile row (by phone) and loads it,
    // along with every role that number holds. The ACTIVE role is the one the
    // user last chose (localStorage) if they still have it, else their primary.
    async function loadProfile() {
        try {
            const { data, error } = await supabase.rpc('link_current_auth_profile');
            if (error || !data) {
                // New user with no profile yet — handled by role selection elsewhere.
                setUserData(null);
                setAvailableRoles([]);
                return;
            }
            const row = Array.isArray(data) ? data[0] : data;
            const roles = await getMyRoles();
            const primary = (row.role as AppRole);
            const known = roles.length > 0 ? roles : [primary];
            const stored = localStorage.getItem('userRole') as AppRole | null;
            const active = stored && known.includes(stored) ? stored : primary;
            setAvailableRoles(known);
            setUserData({
                _id: row.id,
                firebaseUid: row.auth_user_id,
                phoneNumber: row.phone_number,
                role: active,
            });
            localStorage.setItem('userRole', active);
        } catch {
            setUserData(null);
            setAvailableRoles([]);
        }
    }

    // Switch which role (dashboard) the user is operating as, without re-login.
    function switchRole(role: AppRole) {
        setUserData((prev) => (prev ? { ...prev, role } : prev));
        localStorage.setItem('userRole', role);
    }

    useEffect(() => {
        let active = true;

        // Initial session: keep the loading screen up until the profile (and
        // therefore the active role) is known, so routes never guess.
        supabase.auth.getSession().then(async ({ data }) => {
            const sessionUser = data.session?.user ?? null;
            if (!active) return;
            setUser(sessionUser);
            if (sessionUser) await loadProfile();
            if (active) setLoading(false);
        });

        // Later changes. Supabase warns against awaiting other supabase calls
        // inside this callback (it holds the auth lock), so defer the profile
        // load; and skip token refreshes / the initial event handled above.
        const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') return;
            const sessionUser = session?.user ?? null;
            setUser(sessionUser);
            if (sessionUser && event === 'SIGNED_IN') {
                // A fresh OTP login is finished by AuthPage (which may need to ask
                // a multi-role user which role to enter), so don't pick a role for
                // them here; only re-hydrate when a role was already chosen.
                setTimeout(() => {
                    if (!active) return;
                    if (localStorage.getItem('userRole')) loadProfile();
                    else getMyRoles().then(setAvailableRoles).catch(() => {});
                }, 0);
            } else if (!sessionUser) {
                setUserData(null);
                setAvailableRoles([]);
            }
        });

        return () => {
            active = false;
            sub.subscription.unsubscribe();
        };
    }, []);

    // Re-read the role list (e.g. after the user adds a garage role).
    const refreshRoles = async () => setAvailableRoles(await getMyRoles());

    const logout = async () => {
        try {
            await signOut();
            setUser(null);
            setUserData(null);
            setAvailableRoles([]);
            for (const k of ['userRole', 'userData', 'garageOnboarded', 'customerProfile']) localStorage.removeItem(k);
        } catch (error) {
            console.error('Logout error:', error);
        }
    };

    const value: AuthContextType = {
        user,
        userData,
        availableRoles,
        loading,
        isAuthenticated: !!user,
        setUserData,
        setUser,
        switchRole,
        refreshRoles,
        logout,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- hook lives beside its provider
export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
