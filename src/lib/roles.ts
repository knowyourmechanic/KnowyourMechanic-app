import { Car, Wrench, Shield, UserCog, Headset, type LucideIcon } from 'lucide-react';
import { getMyGarageMembership, type AppRole } from './data';

// Presentation for each role — shared by the login picker and the in-app switcher.
export const ROLE_META: Record<AppRole, { label: string; sub: string; Icon: LucideIcon }> = {
    customer: { label: 'Customer', sub: 'Find local experts', Icon: Car },
    garage: { label: 'Garage', sub: 'Owner or employee', Icon: Wrench },
    admin: { label: 'Admin', sub: 'Platform administration', Icon: Shield },
    employee: { label: 'Employee', sub: 'Field operations', Icon: UserCog },
    support: { label: 'Support', sub: 'Help customers & garages', Icon: Headset },
};

// The home route for a role. Garage resolves to onboarding when no garage exists.
export async function routeForRole(role: AppRole): Promise<string> {
    if (role === 'admin') return '/admin';
    if (role === 'support') return '/support';
    if (role === 'employee') return '/employee';
    if (role === 'garage') {
        const path = await garageHome();
        if (path === '/garage') localStorage.setItem('garageOnboarded', 'true');
        else localStorage.removeItem('garageOnboarded');
        return path;
    }
    return '/customer';
}

// Where a garage-role user lands, from their membership:
//  none                           -> /garage/start   (owner or employee?)
//  owner, set up by an employee,
//    not yet confirmed            -> /garage/confirm (is this your garage?)
//  owner / onboarding employee,
//    onboarding unfinished        -> /garage/onboarding
//  employee waiting for approval  -> /garage/pending
//  otherwise                      -> /garage
export async function garageHome(): Promise<string> {
    const m = await getMyGarageMembership();
    if (!m) return '/garage/start';
    if (m.memberRole === 'owner') {
        if (!m.ownerConfirmed) return '/garage/confirm';
        return m.onboardingComplete ? '/garage' : '/garage/onboarding';
    }
    if (m.status === 'pending') return '/garage/pending';
    if (m.onboardedByMe && !m.onboardingComplete) return '/garage/onboarding';
    return '/garage';
}
