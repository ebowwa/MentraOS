// pages/Profile.tsx
import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, AlertCircle, Loader2, Building, Globe, Mail, FileText, Image } from "lucide-react";
import DashboardLayout from "../components/DashboardLayout";
import api from '@/services/api.service';
import { toast } from 'sonner';

const Profile: React.FC = () => {
  // Form state
  const [formData, setFormData] = useState({
    company: '',
    website: '',
    contactEmail: '',
    description: '',
    logo: ''
  });
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  
  // Fetch developer profile data
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const userData = await api.auth.me();
        
        if (userData.profile) {
          setFormData({
            company: userData.profile.company || '',
            website: userData.profile.website || '',
            contactEmail: userData.profile.contactEmail || '',
            description: userData.profile.description || '',
            logo: userData.profile.logo || ''
          });
        }
      } catch (err) {
        console.error('Error fetching profile:', err);
        setError('Failed to load profile data. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchProfile();
  }, []);
  
  // Handle form changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    setIsSaved(false);
    
    try {
      // Update profile via API
      await api.auth.updateProfile(formData);
      
      // Show success message
      setIsSaved(true);
      
      // Create a specific timeout ID to identify this toast
      const toastId = 'update-success-' + Date.now();
      toast.success('Profile updated successfully', { id: toastId });
      
      // Reset saved status after 3 seconds
      setTimeout(() => {
        setIsSaved(false);
      }, 3000);
    } catch (err) {
      console.error('Error updating profile:', err);
      setError('Failed to update profile. Please try again.');
      toast.error('Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };
  
  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto">
        <Card className="shadow-sm">
          {isLoading ? (
            <div className="p-8 text-center">
              <div className="animate-spin mx-auto h-8 w-8 border-t-2 border-b-2 border-blue-500 rounded-full"></div>
              <p className="mt-2 text-gray-500">Loading profile data...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <CardHeader>
                <CardTitle className="text-2xl">Developer Profile</CardTitle>
                <CardDescription>
                  Update your developer information which will be displayed on your app's page in the App Store.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                
                {isSaved && (
                  <Alert className="bg-green-50 text-green-800 border-green-200">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-700">Profile updated successfully!</AlertDescription>
                  </Alert>
                )}
                
                <div className="space-y-2">
                  <Label htmlFor="company" className="flex items-center gap-2">
                    <Building className="h-4 w-4" />
                    Company/Organization
                  </Label>
                  <Input 
                    id="company" 
                    name="company"
                    value={formData.company}
                    onChange={handleChange}
                    placeholder="Your company or organization name" 
                  />
                  <p className="text-xs text-gray-500">
                    The name of your company or organization that will be displayed to users.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="website" className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Website
                  </Label>
                  <Input 
                    id="website" 
                    name="website"
                    value={formData.website}
                    onChange={handleChange}
                    placeholder="https://example.com" 
                  />
                  <p className="text-xs text-gray-500">
                    Your company or personal website URL.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="contactEmail" className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Contact Email
                  </Label>
                  <Input 
                    id="contactEmail" 
                    name="contactEmail"
                    value={formData.contactEmail}
                    onChange={handleChange}
                    placeholder="support@example.com" 
                  />
                  <p className="text-xs text-gray-500">
                    An email address where users can contact you for support or inquiries.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="description" className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Developer Description
                  </Label>
                  <Textarea 
                    id="description" 
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    placeholder="Tell users about your company or team" 
                    rows={4}
                  />
                  <p className="text-xs text-gray-500">
                    A short description of your company or development team.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="logo" className="flex items-center gap-2">
                    <Image className="h-4 w-4" />
                    Logo URL
                  </Label>
                  <Input 
                    id="logo" 
                    name="logo"
                    value={formData.logo}
                    onChange={handleChange}
                    placeholder="https://example.com/logo.png" 
                  />
                  <p className="text-xs text-gray-500">
                    A URL to your company logo (recommended: square format, 512x512 PNG).
                  </p>
                </div>
              </CardContent>
              <CardFooter className="flex justify-end border-t p-6">
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : "Save Profile"}
                </Button>
              </CardFooter>
            </form>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Profile;