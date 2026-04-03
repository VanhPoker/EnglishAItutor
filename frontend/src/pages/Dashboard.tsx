import { motion } from "framer-motion";
import {
  Clock,
  MessageSquare,
  Target,
  TrendingUp,
  Award,
  Calendar,
} from "lucide-react";
import Layout from "../components/ui/Layout";
import Card from "../components/ui/Card";
import ScoreDisplay from "../components/feedback/ScoreDisplay";
import { useUserStore } from "../stores/userStore";

const mockStats = {
  totalSessions: 12,
  totalMinutes: 180,
  wordsLearned: 85,
  errorsFixed: 42,
  currentStreak: 5,
  grammarScore: 72,
  vocabularyScore: 68,
  fluencyScore: 65,
  pronunciationScore: 58,
};

const recentSessions = [
  { date: "Today", topic: "Travel", duration: "15 min", score: 78 },
  { date: "Yesterday", topic: "Daily Life", duration: "20 min", score: 72 },
  { date: "Mar 31", topic: "Technology", duration: "12 min", score: 81 },
  { date: "Mar 30", topic: "Food & Cooking", duration: "18 min", score: 69 },
];

const commonErrors = [
  { type: "Grammar", desc: "Past tense irregular verbs", count: 8 },
  { type: "Grammar", desc: "Article usage (a/an/the)", count: 6 },
  { type: "Vocabulary", desc: "Confusing similar words", count: 5 },
  { type: "Grammar", desc: "Preposition choices", count: 4 },
];

export default function Dashboard() {
  const { level, userName } = useUserStore();

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-2xl font-bold text-gray-900">Your Progress</h1>
          <p className="text-gray-500 mt-1">
            Level: <span className="font-semibold text-primary-600">{level}</span> | Keep practicing to level up!
          </p>
        </motion.div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          {[
            { icon: MessageSquare, label: "Sessions", value: mockStats.totalSessions, color: "text-blue-500 bg-blue-50" },
            { icon: Clock, label: "Minutes", value: mockStats.totalMinutes, color: "text-purple-500 bg-purple-50" },
            { icon: Target, label: "Words Learned", value: mockStats.wordsLearned, color: "text-green-500 bg-green-50" },
            { icon: TrendingUp, label: "Errors Fixed", value: mockStats.errorsFixed, color: "text-amber-500 bg-amber-50" },
            { icon: Award, label: "Day Streak", value: `${mockStats.currentStreak} days`, color: "text-red-500 bg-red-50" },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${stat.color}`}>
                  <stat.icon className="w-4 h-4" />
                </div>
                <p className="text-xl font-bold text-gray-800">{stat.value}</p>
                <p className="text-xs text-gray-500">{stat.label}</p>
              </Card>
            </motion.div>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Score circles */}
          <Card>
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Skill Scores</h2>
            <div className="flex justify-around">
              <ScoreDisplay label="Grammar" score={mockStats.grammarScore} />
              <ScoreDisplay label="Vocab" score={mockStats.vocabularyScore} />
              <ScoreDisplay label="Fluency" score={mockStats.fluencyScore} />
            </div>
          </Card>

          {/* Common errors */}
          <Card>
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Top Areas to Improve</h2>
            <div className="space-y-3">
              {commonErrors.map((err, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        err.type === "Grammar" ? "bg-red-400" : "bg-amber-400"
                      }`}
                    />
                    <span className="text-sm text-gray-700">{err.desc}</span>
                  </div>
                  <span className="text-xs text-gray-400">{err.count}x</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Recent sessions */}
        <Card>
          <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            Recent Sessions
          </h2>
          <div className="space-y-2">
            {recentSessions.map((session, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-16">{session.date}</span>
                  <span className="text-sm text-gray-700">{session.topic}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">{session.duration}</span>
                  <span
                    className={`text-sm font-semibold ${
                      session.score >= 75
                        ? "text-green-600"
                        : session.score >= 60
                        ? "text-amber-600"
                        : "text-red-500"
                    }`}
                  >
                    {session.score}%
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </Card>
      </div>
    </Layout>
  );
}
