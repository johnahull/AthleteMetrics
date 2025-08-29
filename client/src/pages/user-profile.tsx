import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, Mail, User, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  organizations: Array<{
    id: string;
    name: string;
    role: string;
  }>;
}

export default function UserProfile() {
  const { id } = useParams();

  const { data: userProfile, isLoading, error } = useQuery<UserProfile>({
    queryKey: [`/api/users/${id}/profile`],
  });

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center">
          <div className="text-lg">Loading user profile...</div>
        </div>
      </div>
    );
  }

  if (error || !userProfile) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">User Not Found</h1>
          <p className="text-gray-600 mb-4">The user profile you're looking for doesn't exist.</p>
          <Link href="/dashboard">
            <Button>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/dashboard">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
        </Link>
      </div>

      <div className="grid gap-6">
        {/* User Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              User Profile
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  {userProfile.firstName} {userProfile.lastName}
                </h2>
              </div>
              
              <div className="flex items-center gap-2 text-gray-600">
                <Mail className="h-4 w-4" />
                <span>{userProfile.email}</span>
              </div>

              <div>
                <Badge variant="outline">
                  {userProfile.role === 'site_admin' ? 'Site Admin' : 
                   userProfile.role === 'org_admin' ? 'Organization Admin' :
                   userProfile.role === 'coach' ? 'Coach' : 'Athlete'}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Organizations Card */}
        {userProfile.organizations && userProfile.organizations.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Organizations ({userProfile.organizations.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {userProfile.organizations.map((org) => (
                  <div key={org.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <Link href={`/organizations/${org.id}`}>
                        <span className="font-medium text-blue-600 hover:text-blue-700 hover:underline cursor-pointer">
                          {org.name}
                        </span>
                      </Link>
                    </div>
                    <Badge variant="secondary">
                      {org.role === 'org_admin' ? 'Admin' : 
                       org.role === 'coach' ? 'Coach' : 'Athlete'}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}