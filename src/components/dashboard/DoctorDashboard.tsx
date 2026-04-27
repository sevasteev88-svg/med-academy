import { createClient } from '@/utils/supabase/server';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Link from 'next/link';

export default async function DoctorDashboard() {
    const supabase = await createClient();
    // Перевірка підключення до БД
    const { error } = await supabase.from('teams').select('*').limit(1);
    const isDbConnected = !error;

    // Мокові дані для верстки тріажу
    const mockPatients = [
        { id: 1, name: 'Іванов О.', team: 'U19', injury: 'Розрив ПКС', vas: 7, status: 'danger' },
        { id: 2, name: 'Петров М.', team: 'Академія', injury: 'Мікронадрив задньої поверхні', vas: 4, status: 'warn' },
    ];

    return (
        <div className="min-h-screen bg-background text-gray-100 p-6">
            <div className="max-w-5xl mx-auto space-y-8">

                {/* Шапка і статус БД */}
                <div className="flex justify-between items-center border-b border-gray-800 pb-4">
                    <h1 className="text-2xl font-bold text-white">Медичний штаб</h1>
                    <div className={`text-sm px-3 py-1 rounded-full font-medium ${isDbConnected ? 'bg-status-ok/20 text-status-ok' : 'bg-status-danger/20 text-status-danger'}`}>
                        База даних: {isDbConnected ? 'Підключена 🟢' : 'Помилка 🔴'}
                    </div>
                </div>

                {/* Секція: Швидкі дії */}
                <section>
                    <div className="flex flex-wrap gap-3">
                        <button className="bg-brand-blue hover:bg-blue-700 text-white font-bold py-3 px-5 rounded-lg transition-colors shadow-lg shadow-brand-blue/20">
                            + Фіксація травми
                        </button>
                        <button className="border border-brand-blue text-brand-blue hover:bg-brand-blue/10 font-bold py-3 px-5 rounded-lg transition-colors">
                            📐 Гоніометр
                        </button>
                        <Link
                            href="/uk/growth"
                            className="border border-brand-blue text-brand-blue hover:bg-brand-blue/10 font-bold py-3 px-5 rounded-lg transition-colors"
                        >
                            📈 Моніторинг росту
                        </Link>
                        <Link
                            href="/uk/growth/new"
                            className="bg-brand-blue hover:bg-blue-700 text-white font-bold py-3 px-5 rounded-lg transition-colors shadow-lg shadow-brand-blue/20"
                        >
                            📏 Новий вимір
                        </Link>
                    </div>
                </section>

                {/* Секція: Тріаж */}
                <section>
                    <h2 className="text-lg font-semibold text-gray-400 mb-4">Тріаж (Червона та Жовта зони)</h2>
                    <div className="grid gap-4 md:grid-cols-2">
                        {mockPatients.map(p => (
                            <Card key={p.id} className="flex justify-between items-center hover:border-gray-600 transition-colors cursor-pointer">
                                <div>
                                    <div className="font-bold text-white text-lg">{p.name}</div>
                                    <div className="text-sm text-gray-400">{p.team} · {p.injury}</div>
                                </div>
                                <Badge variant={p.status as any}>ВАШ {p.vas}/10</Badge>
                            </Card>
                        ))}
                    </div>
                </section>

            </div>
        </div>
    );
}
