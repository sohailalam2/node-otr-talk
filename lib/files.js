module.exports.UserFiles = UserFiles;

var crypto = require("crypto");

function UserFiles (profile, buddy, VFS, password){

    if(VFS){
      this.keys =  path_vfs(profile.keys);
      this.instags =  path_vfs(profile.instags);
      this.fingerprints = path_vfs(profile.buddyFingerprints(buddy));
    }else{
      this.keys =  path_real(profile.keys);
      this.instags =  path_real(profile.instags);
      this.fingerprints = path_real(profile.buddyFingerprints(buddy));
    }

    this.password = password;

    if(VFS){
        this.VFS = VFS;
        try{
            VFS.importFile(this.keys,this.keys,decryptor(this.password));
            VFS.importFile(this.instags)
            VFS.importFile(this.fingerprints,this.fingerprints,decryptor(this.password));
        }catch(E){
            console.log("Failed to load key-store",E);
            process.exit();
        }
    }
}

UserFiles.prototype.save = function(){
    if(this.VFS){
        console.log("saving key-store");
        try{
          this.VFS.exportFile(this.keys,this.keys,encryptor(this.password));
          this.VFS.exportFile(this.instags);
          this.VFS.exportFile(this.fingerprints,this.fingerprints,encryptor(this.password));
        }catch(E){
            console.log("Failed to save key-store",E);
            process.exit();
        }
    }
};

function path_real(p){
  return p.replace(new RegExp('/', 'g'), path.sep);
}
function path_vfs(p){
  return p.replace(new RegExp(/\\/g), '/');
}

function encryptor(password){
    if(!password) return undefined;
    return (function(buff){
        return encrypt(buff,password);
    });
}
function decryptor(password){
    if(!password) return undefined;
    return (function(buff){
        return decrypt(buff,password);
    });
}

//password must be a 'binary' encoded string or a buffer.
function encrypt(buf,password){
    if(!password) return buf;
    var c = crypto.createCipher('AES256', password);
    var output = c.update(buf)+c.final();
    return (new Buffer(output,'binary'));
}

function decrypt(buf,password){
    if(!password) return buf;
    var c = crypto.createDecipher('AES256', password);
    var output = c.update(buf)+c.final();
    return (new Buffer(output,'binary'));
}