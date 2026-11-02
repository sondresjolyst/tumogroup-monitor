import { requireOwner } from '@/lib/auth/options';

export default async function Home() {
    await requireOwner();
    return <main>Tumogroup monitor</main>;
}
