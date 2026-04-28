"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, User, Mail, Shield, Sparkles, Save, Loader2, MapPin, Calendar, Users, Globe2, MessageSquare } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { LoginModule } from "@/components/LoginModule";
import { fetchUserProfile, updateUserProfile, deleteUserAccount, type UserProfile } from "@/lib/mongo/db";
import { signOut } from "next-auth/react";
import { useTranslations } from 'next-intl';

export default function ProfilePage() {
  const t = useTranslations('ProfilePage');
  const { user, loading } = useAuth();
  
  const [profile, setProfile] = useState<Partial<UserProfile>>({});
  const [isFetching, setIsFetching] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  
  // Deletion State
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (user) {
      loadProfileData();
    } else {
      setIsFetching(false);
    }
  }, [user]);

  const loadProfileData = async () => {
    setIsFetching(true);
    if (user) {
      const data = await fetchUserProfile(user.uid);
      if (data) setProfile(data);
    }
    setIsFetching(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setIsSaving(true);
    setSaveMessage("");
    
    // Clean up undefined values for Firestore
    const cleanedProfile = Object.fromEntries(
      Object.entries(profile).filter(([_, v]) => v !== undefined)
    );
    
    const success = await updateUserProfile(user.uid, cleanedProfile);
    if (success) {
      setSaveMessage(t('profileUpdated'));
      setTimeout(() => setSaveMessage(""), 3000);
    } else {
      setSaveMessage(t('profileUpdateFailed'));
    }
    setIsSaving(false);
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmationText !== "DELETE" || !user) return;
    setIsDeleting(true);
    setSaveMessage("");
    
    // Hard destruction call
    const success = await deleteUserAccount(user.uid);
    if (success) {
      await signOut({ callbackUrl: "/" });
    } else {
      setSaveMessage(t('deleteFailed'));
      setIsDeleting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setProfile(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  if (loading || isFetching) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F6F5F0] dark:bg-zinc-950">
        <Sparkles className="animate-spin text-blue-500" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F6F5F0] dark:bg-zinc-950 px-4">
        <LoginModule />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F3F4F6] dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans p-6 md:p-12 overflow-y-auto w-full">
      <div className="max-w-3xl mx-auto space-y-6">
        
        {/* Navigation */}
        <Link 
          href="/" 
          className="inline-flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
        >
          <ArrowLeft size={16} /> {t('backToDashboard')}
        </Link>

        {/* Profile Card */}
        <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-sm border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="h-32 bg-gradient-to-r from-blue-600 to-indigo-600"></div>
          
          <div className="px-8 pb-8 relative">
            {/* Avatar */}
            <div className="absolute -top-12 w-24 h-24 bg-white dark:bg-zinc-900 rounded-full p-2">
              <div className="w-full h-full bg-blue-100 dark:bg-blue-900/50 rounded-full flex items-center justify-center border-4 border-white dark:border-zinc-900 shadow-sm overflow-hidden">
                <span className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                  {profile.firstName?.[0]?.toUpperCase() || user.email?.[0].toUpperCase() || "U"}
                </span>
              </div>
            </div>

            <div className="pt-16 flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{t('legacyProfile')}</h1>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{t('profileDesc')}</p>
              </div>
            </div>

            <form onSubmit={handleSave} className="mt-10 space-y-8">
              
              {/* Account Security (Read Only) */}
              <div className="bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5">
                <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-2 mb-4">
                  <Shield size={16}/> {t('systemAuth')}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                     <label className="block text-xs font-semibold text-zinc-500 mb-1">{t('emailAddress')}</label>
                     <div className="w-full px-4 py-2 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-100 dark:bg-zinc-950 text-sm text-zinc-500 cursor-not-allowed truncate">
                       {user.email}
                     </div>
                  </div>
                  <div className="overflow-hidden">
                     <label className="block text-xs font-semibold text-zinc-500 mb-1">{t('accountId')}</label>
                     <div className="w-full px-4 py-2 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-100 dark:bg-zinc-950 text-sm text-zinc-500 cursor-not-allowed font-mono truncate">
                       {user.uid}
                     </div>
                  </div>
                </div>
              </div>

              {/* Naming & Identity */}
              <div className="border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5">
                <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-2 mb-4">
                  <User size={16}/> {t('identity')} <span className="text-xs font-normal text-zinc-400 ml-2">{t('optional')}</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">{t('firstName')}</label>
                    <input type="text" name="firstName" value={profile.firstName || ""} onChange={handleChange} className="w-full px-4 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. Eleanor" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">{t('middleName')}</label>
                    <input type="text" name="middleName" value={profile.middleName || ""} onChange={handleChange} className="w-full px-4 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. Grace" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">{t('lastName')}</label>
                    <input type="text" name="lastName" value={profile.lastName || ""} onChange={handleChange} className="w-full px-4 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. Vance" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">{t('formerName')}</label>
                    <input type="text" name="formerName" value={profile.formerName || ""} onChange={handleChange} className="w-full px-4 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. Smith" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">{t('pronouns')}</label>
                    <select name="pronouns" value={profile.pronouns || ""} onChange={handleChange} className="w-full px-4 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer">
                      <option value="">{t('selectPronouns')}</option>
                      <option value="She/Her">She/Her</option>
                      <option value="He/Him">He/Him</option>
                      <option value="They/Them">They/Them</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">{t('genderIdentity')}</label>
                    <select name="genderIdentity" value={profile.genderIdentity || ""} onChange={handleChange} className="w-full px-4 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer">
                      <option value="">{t('selectIdentity')}</option>
                      <option value="Female">Female</option>
                      <option value="Male">Male</option>
                      <option value="Non-binary">Non-binary</option>
                      <option value="Prefer not to say">Prefer not to say</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Origins & Location */}
              <div className="border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5">
                <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-2 mb-4">
                  <MapPin size={16}/> {t('originsLocation')} <span className="text-xs font-normal text-zinc-400 ml-2">{t('optional')}</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1 flex items-center gap-1"><Calendar size={14}/> {t('dateOfBirth')}</label>
                    <input type="date" name="dateOfBirth" value={profile.dateOfBirth || ""} onChange={handleChange} className="w-full px-4 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 text-zinc-900 dark:text-zinc-100" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">{t('placeOfBirth')}</label>
                    <input type="text" name="placeOfBirth" value={profile.placeOfBirth || ""} onChange={handleChange} className="w-full px-4 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. Kyoto, Japan" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1 flex items-center gap-1"><Globe2 size={14}/> {t('currentResidence')}</label>
                    <input type="text" name="residence" value={profile.residence || ""} onChange={handleChange} className="w-full px-4 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. San Francisco, California" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1 flex items-center gap-1"><Users size={14}/> {t('culturalHeritage')}</label>
                    <input type="text" name="culturalHeritage" value={profile.culturalHeritage || ""} onChange={handleChange} className="w-full px-4 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. Irish-American, Han Chinese" />
                  </div>
                </div>
              </div>

              {/* Linguistic Profile */}
              <div className="border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5">
                <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-2 mb-4">
                  <MessageSquare size={16}/> {t('linguisticProfile')} <span className="text-xs font-normal text-zinc-400 ml-2">{t('optional')}</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="md:col-span-1">
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">{t('primaryLanguage')}</label>
                    <input type="text" name="primaryLanguage" value={profile.primaryLanguage || ""} onChange={handleChange} className="w-full px-4 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. English" />
                  </div>
                  <div className="md:col-span-1">
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">{t('secondaryLanguages')}</label>
                    <input type="text" name="secondaryLanguages" value={profile.secondaryLanguages || ""} onChange={handleChange} className="w-full px-4 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. Cantonese, Mandarin" />
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div className="flex items-center justify-end gap-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                {saveMessage && (
                  <span className={`text-sm font-semibold ${saveMessage.includes("Failed") ? "text-red-500" : "text-emerald-500"}`}>
                    {saveMessage}
                  </span>
                )}
                <button 
                  type="submit" 
                  disabled={isSaving}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg transition-transform active:scale-95 flex items-center gap-2"
                >
                  {isSaving ? <Loader2 className="animate-spin" size={18}/> : <Save size={18} />}
                  {t('saveProfile')}
                </button>
              </div>

            </form>

            {/* Danger Zone */}
            <div className="mt-12 pt-8 border-t border-red-200 dark:border-red-900/30">
              <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-2xl p-6">
                <h3 className="text-lg font-bold text-red-600 dark:text-red-500 mb-2">{t('dangerZone')}</h3>
                <p className="text-sm text-red-800/80 dark:text-red-400/80 mb-6 font-medium">{t('dangerZoneDesc')}</p>
                
                {!isConfirmingDelete ? (
                  <button
                    type="button"
                    onClick={() => setIsConfirmingDelete(true)}
                    className="px-6 py-2.5 bg-red-100 hover:bg-red-200 dark:bg-red-900/40 dark:hover:bg-red-900/60 text-red-700 dark:text-red-400 font-bold rounded-xl shadow-sm transition-colors"
                  >
                    {t('deleteAccount')}
                  </button>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-red-200 dark:border-red-800">
                      <label className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                        {t('areYouSure')}
                      </label>
                      <p className="text-xs text-zinc-500 mb-3" dangerouslySetInnerHTML={{ __html: t.raw('typeDelete') }}>
                      </p>
                      <input 
                        type="text" 
                        value={deleteConfirmationText}
                        onChange={(e) => setDeleteConfirmationText(e.target.value)}
                        placeholder="DELETE"
                        className="w-full px-4 py-2 border border-red-300 dark:border-red-700 rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-red-500 mb-3 font-mono text-zinc-900 dark:text-zinc-100"
                      />
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          disabled={deleteConfirmationText !== "DELETE" || isDeleting}
                          onClick={handleDeleteAccount}
                          className="px-6 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold rounded-lg shadow-sm transition-all flex items-center gap-2"
                        >
                          {isDeleting ? <Loader2 className="animate-spin" size={16}/> : null}
                          {t('confirmPurge')}
                        </button>
                        <button
                          type="button"
                          disabled={isDeleting}
                          onClick={() => {
                            setIsConfirmingDelete(false);
                            setDeleteConfirmationText("");
                          }}
                          className="px-4 py-2 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-medium rounded-lg transition-colors"
                        >
                          {t('cancel')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        
        <p className="text-center text-xs text-zinc-400 pb-10">Legacy Nexus v0.1.0 Account Hub</p>
      </div>
    </div>
  );
}
