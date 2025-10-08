#!/bin/bash

# Script to fix author information for Loay Yari commits
# This will change all commits by Loay Yari to use the correct GitHub email

git filter-branch --env-filter '
OLD_EMAIL_1="loay@okrasolar.com"
OLD_EMAIL_2="loay.yari@yari4embedded.com"
CORRECT_NAME="Loay Yari"
CORRECT_EMAIL="megaboy1024@gmail.com"

if [ "$GIT_COMMITTER_EMAIL" = "$OLD_EMAIL_1" ] || [ "$GIT_COMMITTER_EMAIL" = "$OLD_EMAIL_2" ]
then
    export GIT_COMMITTER_NAME="$CORRECT_NAME"
    export GIT_COMMITTER_EMAIL="$CORRECT_EMAIL"
fi
if [ "$GIT_AUTHOR_EMAIL" = "$OLD_EMAIL_1" ] || [ "$GIT_AUTHOR_EMAIL" = "$OLD_EMAIL_2" ]
then
    export GIT_AUTHOR_NAME="$CORRECT_NAME"
    export GIT_AUTHOR_EMAIL="$CORRECT_EMAIL"
fi
' --tag-name-filter cat -- --branches --tags