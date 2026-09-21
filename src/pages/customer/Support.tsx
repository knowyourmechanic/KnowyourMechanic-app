import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, Mail, ArrowRight, ShieldCheck, LifeBuoy, ArrowLeft, ChevronDown, HelpCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import LiveChatPanel from '../../components/LiveChatPanel';

const faqs = [
    {
        question: 'How do I find a garage near me?',
        answer: 'Open the app and allow location access. We\'ll automatically show garages within 5km of your location, sorted by distance.'
    },
    {
        question: 'How do I know if a garage is trustworthy?',
        answer: 'Look for the star rating, number of reviews, and total services completed. Garages with higher ratings and more services have a proven track record.'
    },
    {
        question: 'What does "Verified" vs "Cash" payment mean?',
        answer: '"Verified" means you paid by UPI and confirmed the service with an OTP, so it is recorded as a trusted transaction. "Cash" payments are unverified and marked "Not Trusted". Verified services offer better protection.'
    },
    {
        question: 'How do I leave a review?',
        answer: 'After getting service from a garage, go to your Activity page or the garage\'s detail page. You\'ll see a "Rate this service" option if you\'re eligible.'
    },
    {
        question: 'Can I edit or delete my review?',
        answer: 'Yes! Go to the garage\'s page or your Activity page to find your review. You can edit the rating and comment, or delete it entirely.'
    },
];

export default function CustomerSupport() {
    const navigate = useNavigate();
    const [openFaq, setOpenFaq] = useState<number | null>(null);
    const [showChat, setShowChat] = useState(false);

    const options = [
        {
            icon: MessageCircle,
            label: 'Live Chat',
            description: 'Chat with our support team',
            color: 'text-blue-600',
            bg: 'bg-blue-50 dark:bg-blue-950/40',
            action: () => setShowChat(true)
        },
        {
            icon: Mail,
            label: 'Email Us',
            description: 'knowyourmechanic@gmail.com',
            color: 'text-indigo-600',
            bg: 'bg-indigo-50 dark:bg-indigo-950/40',
            action: () => window.open('mailto:knowyourmechanic@gmail.com')
        },
    ];

    return (
        <>
        <AnimatePresence>
            {showChat && <LiveChatPanel openerRole="customer" onClose={() => setShowChat(false)} />}
        </AnimatePresence>
        <div className="max-w-md mx-auto min-h-screen bg-slate-50 dark:bg-[var(--app-bg)] flex flex-col pt-safe pb-6">
            {/* Header */}
            <header className="bg-blue-600 text-white px-6 py-8 rounded-b-[2.5rem]">
                <button
                    onClick={() => navigate('/customer')}
                    className="flex items-center gap-2 text-white/80 hover:text-white mb-4"
                >
                    <ArrowLeft className="w-5 h-5" />
                    <span className="font-medium">Back</span>
                </button>
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center">
                        <LifeBuoy className="w-7 h-7" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black">Support</h1>
                        <p className="text-blue-200 text-sm">How can we help you today?</p>
                    </div>
                </div>
            </header>

            <div className="px-6 py-6 space-y-4">
                {/* Contact Options */}
                {options.map((option, i) => (
                    <motion.button
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        key={option.label}
                        onClick={option.action}
                        className="w-full premium-card p-6 flex items-center gap-6 group hover:border-blue-300"
                    >
                        <div className={`w-14 h-14 rounded-2xl ${option.bg} ${option.color} flex items-center justify-center`}>
                            <option.icon className="w-7 h-7" />
                        </div>
                        <div className="flex-1 text-left">
                            <h3 className="font-black text-slate-900 dark:text-[var(--app-text)]">{option.label}</h3>
                            <p className="text-slate-400 dark:text-[var(--app-muted)] text-xs font-bold uppercase tracking-wider">{option.description}</p>
                        </div>
                        <ArrowRight className="w-5 h-5 text-slate-300 dark:text-slate-600 group-hover:text-blue-600" />
                    </motion.button>
                ))}

                {/* FAQ Section */}
                <div className="mt-8">
                    <div className="flex items-center gap-2 mb-4">
                        <HelpCircle className="w-5 h-5 text-blue-600" />
                        <h2 className="text-lg font-bold text-slate-900 dark:text-[var(--app-text)]">Frequently Asked Questions</h2>
                    </div>
                    <div className="space-y-3">
                        {faqs.map((faq, i) => (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 + i * 0.05 }}
                                key={i}
                                className="bg-white dark:bg-[var(--app-surface)] rounded-2xl border border-slate-100 dark:border-[var(--app-border)] overflow-hidden"
                            >
                                <button
                                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                                    className="w-full p-4 flex items-center justify-between text-left"
                                >
                                    <span className="font-semibold text-slate-800 dark:text-[var(--app-text)] text-sm pr-4">{faq.question}</span>
                                    <ChevronDown className={`w-5 h-5 text-slate-400 dark:text-[var(--app-muted)] transition-transform flex-shrink-0 ${openFaq === i ? 'rotate-180' : ''}`} />
                                </button>
                                <AnimatePresence>
                                    {openFaq === i && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            className="overflow-hidden"
                                        >
                                            <p className="px-4 pb-4 text-sm text-slate-600 dark:text-[var(--app-muted)]">{faq.answer}</p>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        ))}
                    </div>
                </div>

                {/* Help Card */}
                <div className="mt-6 p-6 bg-blue-600 rounded-[2rem] text-white shadow-xl shadow-blue-500/20">
                    <div className="flex items-center gap-4 mb-3">
                        <ShieldCheck className="w-7 h-7 opacity-80" />
                        <h4 className="text-lg font-black">We're Here to Help</h4>
                    </div>
                    <p className="text-blue-100 text-sm font-medium leading-relaxed">
                        Contact us anytime for assistance with services, payments, or any questions.
                    </p>
                </div>
            </div>
        </div>
        </>
    );
}
