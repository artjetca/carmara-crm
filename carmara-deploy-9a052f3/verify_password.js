import bcrypt from 'bcryptjs';

async function verifyPassword() {
  const password = 'admin123';
  const hash = '$2a$06$K.POoUd0qQv05LRRnfY3b.O9oy6I/.tHadrWzxNROGJZwcuX1.zn2';
  
  console.log('验证密码...');
  console.log('明文密码:', password);
  console.log('存储的哈希:', hash);
  
  const isValid = await bcrypt.compare(password, hash);
  console.log('密码验证结果:', isValid);
  
  // 生成新的哈希进行对比
  const newHash = await bcrypt.hash(password, 10);
  console.log('新生成的哈希:', newHash);
  
  const newIsValid = await bcrypt.compare(password, newHash);
  console.log('新哈希验证结果:', newIsValid);
}

verifyPassword();