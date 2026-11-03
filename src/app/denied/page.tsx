import { AuthCard } from '@/components/auth/AuthCard';

export default function Denied() {
    return (
        <AuthCard>
            <p className="text-center text-sm">This account does not have access to this page.</p>
        </AuthCard>
    );
}
