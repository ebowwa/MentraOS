# Check if we're in a "scripts" directory
current_dir=$(basename "$PWD")
if [ "$current_dir" = "scripts" ]; then
    echo "In scripts directory, moving to parent..."
    cd ..
    echo "Now in: $PWD"
else
    echo "Not in a scripts directory. Current directory: $current_dir"
fi

bun i
bun expo prebuild
cd ios
pod install
cd ..