import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  MessageSquare,
  Mic,
  Brain,
  TrendingUp,
  BookOpen,
  Sparkles,
  ArrowRight,
  Shield,
  ListChecks,
} from "lucide-react";
import Layout from "../components/ui/Layout";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import { claimAdminAccess, getAdminBootstrapStatus } from "../lib/api";
import { useAuthStore } from "../stores/authStore";
import { useUserStore } from "../stores/userStore";

const features = [
  {
    icon: Mic,
    title: "Voice Conversation",
    desc: "Practice speaking English in real-time with AI voice chat",
    color: "text-blue-500 bg-blue-50",
  },
  {
    icon: MessageSquare,
    title: "Text Chat",
    desc: "Type messages and get instant feedback on your English",
    color: "text-purple-500 bg-purple-50",
  },
  {
    icon: Brain,
    title: "Smart Memory",
    desc: "Your tutor remembers your mistakes and tracks your progress",
    color: "text-amber-500 bg-amber-50",
  },
  {
    icon: TrendingUp,
    title: "Adaptive Learning",
    desc: "Difficulty adjusts to your CEFR level automatically",
    color: "text-green-500 bg-green-50",
  },
];

const topics = [
  { name: "Free Conversation", value: "free_conversation", emoji: "💬" },
  { name: "Daily Life", value: "daily_life", emoji: "🏠" },
  { name: "Travel", value: "travel", emoji: "✈️" },
  { name: "Work & Career", value: "work_career", emoji: "💼" },
  { name: "Food & Cooking", value: "food_cooking", emoji: "🍳" },
  { name: "Movies & Books", value: "movies_books", emoji: "🎬" },
  { name: "Technology", value: "technology", emoji: "💻" },
  { name: "Health & Fitness", value: "health_fitness", emoji: "🏃" },
];

const levels = ["A1", "A2", "B1", "B2", "C1", "C2"];

export default function Home() {
  const navigate = useNavigate();
  const authUser = useAuthStore((s) => s.user);
  const updateAuthUser = useAuthStore((s) => s.updateUser);
  const { level, topic, setLevel, setTopic } = useUserStore();
  const [canClaimAdmin, setCanClaimAdmin] = useState(false);
  const [claimingAdmin, setClaimingAdmin] = useState(false);

  useEffect(() => {
    if (authUser?.role === "admin") {
      setCanClaimAdmin(false);
      return;
    }

    getAdminBootstrapStatus()
      .then((status) => setCanClaimAdmin(!status.admin_exists))
      .catch(() => setCanClaimAdmin(false));
  }, [authUser?.role]);

  const handleStart = () => {
    navigate("/practice");
  };

  const handleQuiz = () => {
    navigate("/quizzes");
  };

  const handleClaimAdmin = async () => {
    setClaimingAdmin(true);
    try {
      const updatedUser = await claimAdminAccess();
      updateAuthUser(updatedUser);
      navigate("/admin/users");
    } finally {
      setClaimingAdmin(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 bg-primary-50 text-primary-600 px-4 py-1.5 rounded-full text-sm font-medium mb-4">
            <Sparkles className="w-4 h-4" />
            AI-Powered English Tutor
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Master English Through
            <span className="text-primary-600"> Conversation</span>
          </h1>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto">
            Practice speaking and writing English with an AI tutor that adapts to your level,
            corrects your mistakes naturally, and remembers your progress.
          </p>
        </motion.div>

        {canClaimAdmin && (
          <Card className="mb-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-50 text-green-600 flex items-center justify-center">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Admin access is still unclaimed</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Claim admin once, then manage users, levels, and roles from the admin area.
                  </p>
                </div>
              </div>

              <Button
                type="button"
                onClick={() => void handleClaimAdmin()}
                loading={claimingAdmin}
              >
                Claim Admin
              </Button>
            </div>
          </Card>
        )}

        {/* Features grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <Card className="text-center h-full">
                <div className={`w-10 h-10 mx-auto rounded-xl flex items-center justify-center mb-3 ${f.color}`}>
                  <f.icon className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-semibold text-gray-800">{f.title}</h3>
                <p className="text-xs text-gray-500 mt-1">{f.desc}</p>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Setup Section */}
        <Card className="mb-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary-500" />
            Set Up Your Session
          </h2>

          {/* Level selector */}
          <div className="mb-6">
            <label className="text-sm font-medium text-gray-600 mb-2 block">
              Your English Level (CEFR)
            </label>
            <div className="flex gap-2 flex-wrap">
              {levels.map((l) => (
                <button
                  key={l}
                  onClick={() => setLevel(l)}
                  className={`
                    px-4 py-2 rounded-lg text-sm font-medium transition-all
                    ${
                      level === l
                        ? "bg-primary-600 text-white shadow-md"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }
                  `}
                >
                  {l}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {level === "A1" && "Beginner — simple phrases and everyday expressions"}
              {level === "A2" && "Elementary — frequently used expressions, basic communication"}
              {level === "B1" && "Intermediate — can deal with most situations while travelling"}
              {level === "B2" && "Upper Intermediate — can interact with fluency and spontaneity"}
              {level === "C1" && "Advanced — can express ideas fluently and spontaneously"}
              {level === "C2" && "Proficiency — can understand virtually everything heard or read"}
            </p>
          </div>

          {/* Topic selector */}
          <div className="mb-6">
            <label className="text-sm font-medium text-gray-600 mb-2 block">
              Conversation Topic
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {topics.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTopic(t.value)}
                  className={`
                    flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm transition-all text-left
                    ${
                      topic === t.value
                        ? "bg-primary-50 border-2 border-primary-400 text-primary-700 font-medium"
                        : "bg-gray-50 border-2 border-transparent text-gray-600 hover:bg-gray-100"
                    }
                  `}
                >
                  <span>{t.emoji}</span>
                  <span>{t.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <button onClick={handleStart} className="btn-primary w-full flex items-center justify-center gap-2">
              Start Practicing
              <ArrowRight className="w-4 h-4" />
            </button>
            <button onClick={handleQuiz} className="btn-secondary w-full flex items-center justify-center gap-2">
              Create Quiz
              <ListChecks className="w-4 h-4" />
            </button>
          </div>
        </Card>
      </div>
    </Layout>
  );
}
