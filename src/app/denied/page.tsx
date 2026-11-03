import { AuthLayout } from '@/components/auth/AuthLayout';

export default function Denied() {
    return (
        <AuthLayout>
            <p className="text-base">This account does not have access to this page.</p>
        </AuthLayout>
    );
}
